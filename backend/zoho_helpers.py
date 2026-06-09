import logging
import requests
from typing import Optional, Dict, Any
from core import ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORGANIZATION_ID

log = logging.getLogger("uvicorn")

# Typically, Indian users use zoho.in, but it might be zoho.com. We'll use .in based on the context.
ZOHO_AUTH_URL = "https://accounts.zoho.in/oauth/v2/token"
ZOHO_API_BASE = "https://www.zohoapis.in/books/v3"

class ZohoBooksClient:
    def __init__(self):
        self.access_token: Optional[str] = None
        
    def is_configured(self) -> bool:
        return bool(ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN and ZOHO_ORGANIZATION_ID)

    def _get_access_token(self) -> Optional[str]:
        if not self.is_configured():
            log.warning("Zoho Books credentials not fully configured. Skipping invoice generation.")
            return None

        if self.access_token:
            # Return cached token — Zoho access tokens are valid for 1 hour.
            # For production, add expiry tracking to auto-refresh.
            return self.access_token
            
        try:
            resp = requests.post(ZOHO_AUTH_URL, data={
                "refresh_token": ZOHO_REFRESH_TOKEN,
                "client_id": ZOHO_CLIENT_ID,
                "client_secret": ZOHO_CLIENT_SECRET,
                "grant_type": "refresh_token"
            }, timeout=10)
            
            if resp.status_code == 200:
                data = resp.json()
                if "access_token" in data:
                    self.access_token = data["access_token"]
                    return self.access_token
            
            log.error(f"Failed to get Zoho access token: {resp.text}")
        except Exception as e:
            log.error(f"Zoho token error: {str(e)}")
            
        return None

    def _headers(self) -> dict:
        return {
            "Authorization": f"Zoho-oauthtoken {self.access_token}",
            "Content-Type": "application/json"
        }

    def find_or_create_customer(self, user: dict) -> Optional[str]:
        """Finds a customer by email, or creates one. Returns contact_id."""
        token = self._get_access_token()
        if not token:
            return None
            
        email = user.get("email")
        if not email:
            return None
            
        # 1. Search for existing
        try:
            resp = requests.get(
                f"{ZOHO_API_BASE}/contacts",
                params={"email": email, "organization_id": ZOHO_ORGANIZATION_ID},
                headers=self._headers(),
                timeout=10
            )
            if resp.status_code == 200:
                contacts = resp.json().get("contacts", [])
                if contacts:
                    return contacts[0]["contact_id"]
        except Exception as e:
            log.error(f"Zoho contact search error: {str(e)}")
            
        # 2. Create new
        payload = {
            "contact_name": user.get("name") or "Homesqre Customer",
            "contact_type": "customer",
            "customer_sub_type": "individual",
            "contact_persons": [{
                "first_name": user.get("name") or "Customer",
                "email": email,
                "phone": user.get("phone", ""),
                "is_primary_contact": True
            }]
        }
        
        try:
            resp = requests.post(
                f"{ZOHO_API_BASE}/contacts",
                params={"organization_id": ZOHO_ORGANIZATION_ID},
                headers=self._headers(),
                json=payload,
                timeout=10
            )
            if resp.status_code in (200, 201):
                return resp.json().get("contact", {}).get("contact_id")
            log.error(f"Failed to create Zoho contact: {resp.text}")
        except Exception as e:
            log.error(f"Zoho contact creation error: {str(e)}")
            
        return None

    def create_and_send_invoice(self, user: dict, amount: float, description: str, reference_id: str) -> bool:
        """Creates an invoice, marks it as paid, and emails it."""
        contact_id = self.find_or_create_customer(user)
        if not contact_id:
            return False
            
        # 1. Create Invoice
        invoice_payload = {
            "customer_id": contact_id,
            "reference_number": reference_id,
            "line_items": [{
                "name": "Design & Execution Services",
                "description": description,
                "rate": amount,
                "quantity": 1
            }],
            "status": "draft" # Will be automatically sent/paid
        }
        
        invoice_id = None
        try:
            resp = requests.post(
                f"{ZOHO_API_BASE}/invoices",
                params={"organization_id": ZOHO_ORGANIZATION_ID},
                headers=self._headers(),
                json=invoice_payload,
                timeout=10
            )
            if resp.status_code in (200, 201):
                invoice_id = resp.json().get("invoice", {}).get("invoice_id")
            else:
                log.error(f"Failed to create Zoho invoice: {resp.text}")
                return False
        except Exception as e:
            log.error(f"Zoho invoice creation error: {str(e)}")
            return False
            
        if not invoice_id:
            return False
            
        # 2. Mark as Paid (Record Payment)
        payment_payload = {
            "customer_id": contact_id,
            "payment_mode": "Razorpay",
            "amount": amount,
            "date": "",  # filled below
            "reference_number": reference_id,
            "invoices": [
                {
                    "invoice_id": invoice_id,
                    "amount_applied": amount
                }
            ]
        }
        from datetime import datetime
        payment_payload["date"] = datetime.now().strftime("%Y-%m-%d")
        
        try:
            resp = requests.post(
                f"{ZOHO_API_BASE}/customerpayments",
                params={"organization_id": ZOHO_ORGANIZATION_ID},
                headers=self._headers(),
                json=payment_payload,
                timeout=10
            )
            if resp.status_code not in (200, 201):
                log.error(f"Failed to record payment in Zoho: {resp.text}")
        except Exception as e:
            log.error(f"Zoho payment recording error: {str(e)}")

        # 3. Email Invoice
        try:
            requests.post(
                f"{ZOHO_API_BASE}/invoices/{invoice_id}/email",
                params={"organization_id": ZOHO_ORGANIZATION_ID},
                headers=self._headers(),
                timeout=10
            )
        except Exception as e:
            log.error(f"Zoho email sending error: {str(e)}")
            
        return True

zoho_books = ZohoBooksClient()
