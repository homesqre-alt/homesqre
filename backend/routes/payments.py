import uuid
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import razorpay

from core import api, db, iso, now_utc, current_user, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
from crm_helpers import _auto_assign_for_status
from zoho_helpers import zoho_books

log = logging.getLogger("uvicorn")

try:
    rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
except Exception as e:
    log.warning(f"Failed to initialize Razorpay client: {e}")
    rzp_client = None


class CreateOrderRequest(BaseModel):
    payment_type: str # "initial_package", "package_adjustment", "quotation_milestone"
    amount: float # in INR
    metadata: Optional[Dict[str, Any]] = {}

class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

@api.post("/payments/create-order")
async def create_order(body: CreateOrderRequest, user: dict = Depends(current_user)):
    if not rzp_client:
        raise HTTPException(status_code=500, detail="Payment gateway not configured")

    amount = body.amount

    # Server-side amount validation — never trust the client
    if body.payment_type == "initial_package":
        assigned_pkg = user.get("assigned_package", {})
        expected_amount = assigned_pkg.get("final_price")
        if expected_amount is None:
            raise HTTPException(status_code=400, detail="No package has been assigned yet.")
        if int(amount) != int(expected_amount):
            raise HTTPException(status_code=400, detail=f"Invalid payment amount. Expected ₹{expected_amount:,.0f}")
    elif body.payment_type == "quotation_milestone":
        milestone_id = body.metadata.get("milestone_id")
        # Find quotation and milestone
        quotation = await db.quotations.find_one({"user_id": user["user_id"]}, sort=[("created_at", -1)])
        if not quotation:
            raise HTTPException(status_code=404, detail="Quotation not found")
        milestone = next((m for m in quotation["milestones"] if m["id"] == milestone_id), None)
        if not milestone:
            raise HTTPException(status_code=404, detail="Milestone not found")
        if milestone["status"] != "unlocked":
            raise HTTPException(status_code=400, detail="Milestone not unlocked")
        amount = float(milestone["amount"])

    amount_paise = int(amount * 100)
    receipt_id = f"rcpt_{uuid.uuid4().hex[:10]}"
    
    try:
        order = rzp_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt_id,
            "notes": {
                "payment_type": body.payment_type,
                "user_id": user["user_id"]
            }
        })
    except Exception as e:
        log.error(f"Razorpay order creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create payment order: {str(e)}")
        
    # Save the order intent in our database
    await db.payment_orders.insert_one({
        "order_id": order["id"],
        "receipt_id": receipt_id,
        "user_id": user["user_id"],
        "payment_type": body.payment_type,
        "amount": amount,
        "metadata": body.metadata,
        "status": "created",
        "created_at": iso(now_utc())
    })
    
    return {
        "ok": True,
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": RAZORPAY_KEY_ID
    }

@api.post("/payments/verify")
async def verify_payment(body: VerifyPaymentRequest, user: dict = Depends(current_user)):
    if not rzp_client:
        raise HTTPException(status_code=500, detail="Payment gateway not configured")

    # 1. Verify signature
    try:
        rzp_client.utility.verify_payment_signature({
            "razorpay_order_id": body.razorpay_order_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "razorpay_signature": body.razorpay_signature
        })
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # 2. Find order and verify ownership
    order = await db.payment_orders.find_one({"order_id": body.razorpay_order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Order does not belong to you")
        
    if order.get("status") == "paid":
        return {"ok": True, "message": "Already processed"}

    payment_type = order["payment_type"]
    amount = order["amount"]
    metadata = order["metadata"]
    
    # 3. Process business logic based on payment_type
    if payment_type == "initial_package":
        # Advance phase to designing
        fresh_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"project_phase": "designing", "phase_updated_at": iso(now_utc())}}
        )
        # Ensure design project is created since verification was implicitly handled by Sales
        from design_helpers import ensure_design_project
        # Find latest verification
        ver = await db.verifications.find_one({"user_id": user["user_id"]}, sort=[("created_at", -1)])
        if ver:
            await ensure_design_project(user["user_id"], verification_id=ver["verification_id"])
            # Mark verification as fully approved/paid
            await db.verifications.update_one({"verification_id": ver["verification_id"]}, {"$set": {"status": "approved"}})
        
        # Sync lead status to Payment Received
        if fresh_user:
            from crm_helpers import find_or_create_lead_for_user
            await find_or_create_lead_for_user(
                fresh_user,
                status="Payment Received",
                comment_text=f"Payment of ₹{amount:,.0f} received via Razorpay. Design retainer confirmed."
            )
        description = "Initial Design Package Retainer"
        
    elif payment_type == "quotation_milestone":
        milestone_id = metadata.get("milestone_id")
        project = await db.design_projects.find_one({"user_id": user["user_id"]}, sort=[("created_at", -1)])
        if not project:
            raise HTTPException(status_code=404, detail="Design project not found")
        quotation = await db.quotations.find_one({"project_id": project["project_id"]}, sort=[("created_at", -1)])
        if not quotation:
            raise HTTPException(status_code=404, detail="Quotation not found")

        milestone_idx = next((i for i, m in enumerate(quotation["milestones"]) if m["id"] == milestone_id), None)
        if milestone_idx is None:
            raise HTTPException(status_code=404, detail="Milestone not found")
        milestone = quotation["milestones"][milestone_idx]
        receipt_id = order["receipt_id"]
        
        update_q = {
            f"milestones.{milestone_idx}.status": "paid",
            f"milestones.{milestone_idx}.receipt_id": receipt_id,
            f"milestones.{milestone_idx}.paid_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        }
        
        if milestone_idx == 0:
            update_q["status"] = "approved"
            update_q["approved_at"] = iso(now_utc())
            update_q["advance_paid"] = milestone["amount"]
            update_q["receipt_id"] = receipt_id
            
        await db.quotations.update_one(
            {"quotation_id": quotation["quotation_id"]},
            {"$set": update_q}
        )
        
        if milestone_idx == 0:
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"project_phase": "production", "production_started_at": iso(now_utc())}}
            )
            await db.design_projects.update_one(
                {"project_id": project["project_id"]},
                {"$set": {"status": "in_production", "updated_at": iso(now_utc())}}
            )
            if project.get("lead_id"):
                await db.leads.update_one(
                    {"lead_id": project["lead_id"]},
                    {"$push": {"comments": {
                        "id": f"c_{receipt_id}",
                        "by": "system",
                        "by_name": "System",
                        "text": f"Customer approved quotation and paid milestone '{milestone['name']}' (\u20b9{milestone['amount']:,.0f}). Project moved to production.",
                        "at": iso(now_utc()),
                    }},
                    "$set": {"status": "In Production", "updated_at": iso(now_utc())}}
                )
        else:
            if project.get("lead_id"):
                await db.leads.update_one(
                    {"lead_id": project["lead_id"]},
                    {"$push": {"comments": {
                        "id": f"c_{receipt_id}",
                        "by": "system",
                        "by_name": "System",
                        "text": f"Customer paid milestone '{milestone['name']}' (\u20b9{milestone['amount']:,.0f}).",
                        "at": iso(now_utc()),
                    }},
                    "$set": {"updated_at": iso(now_utc())}}
                )
        description = f"Quotation Milestone: {milestone['name']}"
    
    # 4. Mark order as paid
    await db.payment_orders.update_one(
        {"order_id": order["order_id"]},
        {"$set": {"status": "paid", "payment_id": body.razorpay_payment_id, "paid_at": iso(now_utc())}}
    )

    # 5. Generate Zoho Invoice
    try:
        # Fetch latest user details (especially phase) if needed, but we have `user` from Depends
        zoho_books.create_and_send_invoice(
            user=user,
            amount=amount,
            description=description,
            reference_id=order["receipt_id"]
        )
    except Exception as e:
        log.error(f"Failed to generate Zoho invoice after payment: {e}")

    return {"ok": True, "message": "Payment verified and processed successfully"}
