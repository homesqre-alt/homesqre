"""Notification helpers — centralised event observer for pipeline milestones.

Currently logs all events to the application logger. To activate real email
delivery, set SENDGRID_API_KEY (or SES/Mailgun equivalent) in the environment
and swap the `_send_email` stub below with the real SDK call.

Usage (from any route):
    from notification_helpers import notify
    await notify("renders_uploaded", user=user_doc, project=project_doc)
"""
import os
import logging
from typing import Optional

log = logging.getLogger("homesqre.notifications")

# Set to True once a real email provider is configured
EMAIL_ENABLED = os.environ.get("EMAIL_ENABLED", "false").lower() == "true"
FROM_EMAIL = os.environ.get("FROM_EMAIL", "no-reply@homesqre.com")
APP_URL = os.environ.get("APP_URL", "https://homesqre.com")


async def _send_email(to: str, subject: str, body: str) -> None:
    """Stub — replace with SendGrid / SES / Mailgun SDK call."""
    if EMAIL_ENABLED:
        # Example SendGrid integration:
        # import sendgrid
        # sg = sendgrid.SendGridAPIClient(api_key=os.environ['SENDGRID_API_KEY'])
        # message = Mail(from_email=FROM_EMAIL, to_emails=to, subject=subject, html_content=body)
        # sg.send(message)
        log.info(f"[EMAIL SENT] To: {to} | Subject: {subject}")
    else:
        log.info(f"[EMAIL STUB] To: {to} | Subject: {subject} | Body preview: {body[:120]}...")


async def notify(event: str, user: Optional[dict] = None, extra: Optional[dict] = None) -> None:
    """Fire a notification for a pipeline event.

    Events:
        lead_created          — New lead assigned to sales
        discovery_call        — Discovery call request received
        floor_plan_rejected   — Verification rejected (package mismatch or hard reject)
        renders_uploaded      — Designer uploaded new 3D renders
        renders_all_approved  — Customer approved all renders, quotation stage begins
        quotation_compiled    — Admin compiled execution quotation
        advance_paid          — Customer paid booking advance, project in production
        site_visit_scheduled  — Customer booked a site visit
    """
    extra = extra or {}
    customer_email = (user or {}).get("email", "")
    customer_name = (user or {}).get("name", "Customer")

    templates = {
        "lead_created": (
            "New Lead Received — Homesqre",
            f"A new lead has been assigned to the sales team."
        ),
        "discovery_call": (
            f"Discovery Call Request from {customer_name} — Homesqre",
            f"<p>{customer_name} requested a discovery call. Our team will call them back within 30 minutes.</p>"
        ),
        "floor_plan_rejected": (
            "Action Required: Your Floor Plan Submission — Homesqre",
            f"<p>Hi {customer_name},</p><p>Our designer reviewed your floor plan and needs a correction. "
            f"Please log in to your dashboard to see details and take action.</p>"
            f"<p><a href='{APP_URL}/dashboard/customer'>View Dashboard</a></p>"
        ),
        "renders_uploaded": (
            "Your 3D Designs Are Ready for Review! — Homesqre",
            f"<p>Hi {customer_name},</p><p>Your designer has uploaded new 3D renders for your review. "
            f"Log in to approve or request changes.</p>"
            f"<p><a href='{APP_URL}/dashboard/customer'>Review Designs</a></p>"
        ),
        "renders_all_approved": (
            "Designs Approved — Your Quotation Is Being Prepared — Homesqre",
            f"<p>Hi {customer_name},</p><p>Congratulations! All your 3D designs are approved. "
            f"Our team is now preparing your detailed execution quotation. We'll notify you once it's ready.</p>"
        ),
        "quotation_compiled": (
            "Your Execution Quotation Is Ready — Homesqre",
            f"<p>Hi {customer_name},</p><p>Your itemized execution quotation is ready for review. "
            f"Log in to review, download, and approve your project.</p>"
            f"<p><a href='{APP_URL}/dashboard/customer'>View Quotation</a></p>"
        ),
        "advance_paid": (
            "Booking Confirmed — Your Project Moves to Production! — Homesqre",
            f"<p>Hi {customer_name},</p><p>Your booking advance has been received. "
            f"Your project is now in production. Our team will be in touch with your 45-day delivery schedule.</p>"
        ),
        "site_visit_scheduled": (
            "Site Visit Confirmed — Homesqre",
            f"<p>Hi {customer_name},</p><p>Your site visit has been scheduled for "
            f"{extra.get('site_visit_at', 'your chosen time')}. "
            f"Our engineer will visit your property for precise measurements.</p>"
        ),
    }

    subject, body = templates.get(event, (f"Update from Homesqre [{event}]", "<p>There is an update on your project.</p>"))
    if customer_email:
        await _send_email(customer_email, subject, body)
    log.info(f"[NOTIFY] event={event} user={customer_email or 'N/A'}")
