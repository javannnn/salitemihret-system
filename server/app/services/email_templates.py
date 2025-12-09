from __future__ import annotations

from datetime import datetime
from typing import Sequence

from app.core.config import settings
from app.models.member import Child, Member

ACCENT = "#111827"
BG = "#f5f5f7"
CARD = "#ffffff"
TEXT = "#0f172a"
MUTED = "#6b7280"
BRAND_NAME = settings.EMAIL_FROM_NAME or "St. Mary EOTC Edmonton"


def _wrap_brand_email(
    *,
    headline: str,
    body_html: str,
    preview_text: str | None = None,
    cta_label: str | None = None,
    cta_url: str | None = None,
    footer_lines: Sequence[str] | None = None,
) -> str:
    preview = preview_text or headline
    footer_html = ""
    if footer_lines:
        footer_html = (
            '<p style="margin:20px 0 0 0; color:{muted}; font-size:13px; line-height:1.5;">{footer}</p>'.format(
                muted=MUTED, footer="<br>".join(footer_lines)
            )
        )
    cta_block = ""
    if cta_label and cta_url:
        cta_block = f"""
        <div style="text-align:center; margin:28px 0 14px;">
            <a href="{cta_url}" style="background:{ACCENT}; color:#ffffff; text-decoration:none; padding:14px 22px; border-radius:12px; display:inline-block; font-weight:700; letter-spacing:0.01em;">{cta_label}</a>
        </div>
        """
    return f"""<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>{headline}</title>
  </head>
  <body style="margin:0; padding:0; background:{BG}; color:{TEXT}; font-family:'Inter','Segoe UI',Arial,sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">{preview}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:{BG}; padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="620" style="background:{CARD}; border-radius:18px; box-shadow:0 16px 48px rgba(0,0,0,0.06); overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg, #111827, #1f2937); padding:20px 24px; color:#f8fafc;">
                <div style="font-size:12px; letter-spacing:0.16em; text-transform:uppercase; opacity:0.8;">{BRAND_NAME}</div>
                <div style="font-size:22px; font-weight:700; margin-top:6px;">{headline}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:15px; line-height:1.6; color:{TEXT};">
                  {body_html}
                </div>
                {cta_block}
                {footer_html}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def render_invitation_email(
    *,
    invite_url: str,
    token: str,
    expires_at: datetime,
    invited_by: str | None,
    roles: Sequence[str],
    message: str | None,
    invitee_email: str,
) -> tuple[str, str]:
    expires_text = expires_at.strftime("%b %d, %Y %H:%M %Z") or expires_at.isoformat()
    roles_text = ", ".join(roles) if roles else "No roles assigned yet"
    personal_note = (
        f'<div style="margin-top:14px; padding:14px 16px; border-radius:12px; background:#fff7ed; border:1px solid #fed7aa; color:{TEXT};">'
        f"<strong>Note from {invited_by}:</strong><br>{message}</div>"
        if message
        else ""
    )
    body_html = f"""
      <p style="margin:0 0 12px 0;">Hi there,</p>
      <p style="margin:0 0 16px 0;">{invited_by or "A team member"} invited you to the {BRAND_NAME} console. Use the button below to activate your account and set a password.</p>
      <div style="margin-top:8px; padding:14px 16px; background:#f8fafc; border-radius:12px; border:1px solid #e5e7eb;">
        <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:{MUTED}; margin-bottom:6px;">Invitation</div>
        <div style="color:{TEXT}; line-height:1.6;">
          <strong>Email:</strong> {invitee_email}<br>
          <strong>Roles:</strong> {roles_text}<br>
          <strong>Expires:</strong> {expires_text}<br>
          <strong>Token:</strong> <code style="background:#0b111a; color:#f8fafc; padding:3px 6px; border-radius:8px; font-size:12px;">{token}</code>
        </div>
        {personal_note}
      </div>
      <p style="margin:16px 0 0 0; color:{MUTED};">If the button does not work, open the onboarding page and paste the token above.</p>
    """
    html = _wrap_brand_email(
        headline=f"Finish setting up your {BRAND_NAME} account",
        body_html=body_html,
        preview_text=f"You're invited to the {BRAND_NAME} console",
        cta_label="Accept invitation",
        cta_url=invite_url,
        footer_lines=[f"This invitation expires {expires_text}.", f"Sent automatically by the {BRAND_NAME} system."],
    )
    text = (
        f"You're invited to the {BRAND_NAME} console.\n\n"
        f"Accept your invitation: {invite_url}\n"
        f"Token: {token}\n"
        f"Roles: {roles_text}\n"
        f"Expires: {expires_text}\n"
    )
    if invited_by:
        text += f"Invited by: {invited_by}\n"
    if message:
        text += f"\nNote: {message}\n"
    text += "\nIf the button does not work, open the onboarding page and paste the token above.\n"
    return html, text


def render_password_reset_email(
    *,
    reset_url: str,
    token: str,
    expires_at: datetime,
    requested_by: str | None,
    invitee_email: str,
) -> tuple[str, str]:
    expires_text = expires_at.strftime("%b %d, %Y %H:%M %Z") or expires_at.isoformat()
    body_html = f"""
      <p style="margin:0 0 12px 0;">We received a request to reset console access for <strong>{invitee_email}</strong>.</p>
      <p style="margin:0 0 16px 0;">Use the button below to create a new password. The invitation is single-use and will expire on {expires_text}.</p>
      <div style="margin-top:8px; padding:14px 16px; background:#f8fafc; border-radius:12px; border:1px solid #e5e7eb;">
        <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:{MUTED}; margin-bottom:6px;">Reset link</div>
        <div style="color:{TEXT}; line-height:1.6;">
          <strong>Token:</strong> <code style="background:#0b111a; color:#f8fafc; padding:3px 6px; border-radius:8px; font-size:12px;">{token}</code><br>
          <strong>Expires:</strong> {expires_text}
        </div>
      </div>
      <p style="margin:16px 0 0 0; color:{MUTED};">If you did not request this, you can ignore the message. No changes will be made until the link is used.</p>
    """
    html = _wrap_brand_email(
        headline=f"Reset your {BRAND_NAME} console access",
        body_html=body_html,
        preview_text=f"Password reset for your {BRAND_NAME} account",
        cta_label="Reset password",
        cta_url=reset_url,
        footer_lines=[
            f"Requested by: {requested_by or 'System request'}." if requested_by else "Reset requested through the console.",
            f"Link expires {expires_text}.",
        ],
    )
    text = (
        f"Reset your {BRAND_NAME} console access.\n\n"
        f"Reset link: {reset_url}\n"
        f"Token: {token}\n"
        f"Expires: {expires_text}\n"
    )
    if requested_by:
        text += f"Requested by: {requested_by}\n"
    text += "If you did not request this, you can ignore this email.\n"
    return html, text


def render_child_promotion_digest_email(
    *,
    items: Sequence[dict[str, str]],
    lookahead_days: int,
    dashboard_url: str,
) -> tuple[str, str]:
    rows = "".join(
        f"""
        <tr>
          <td style="padding:10px 8px; border-bottom:1px solid #e5e7eb;">{item['child_name']}</td>
          <td style="padding:10px 8px; border-bottom:1px solid #e5e7eb; color:{TEXT}; font-weight:600;">{item['turns_on']}</td>
          <td style="padding:10px 8px; border-bottom:1px solid #e5e7eb; color:{MUTED};">{item['parent_name']}</td>
          <td style="padding:10px 8px; border-bottom:1px solid #e5e7eb; color:{MUTED}; text-align:right;">{item['household']}</td>
        </tr>
        """
        for item in items
    )
    table_html = f"""
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; margin-top:12px; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
        <thead>
          <tr style="background:#f3f4f6; text-align:left; color:{TEXT};">
            <th style="padding:12px 8px;">Child</th>
            <th style="padding:12px 8px;">Turns 18</th>
            <th style="padding:12px 8px;">Guardian</th>
            <th style="padding:12px 8px; text-align:right;">Household</th>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    """
    body_html = f"""
      <p style="margin:0 0 12px 0;">Here is the {lookahead_days}-day outlook for children approaching 18. Review and promote them so records stay accurate.</p>
      {table_html}
      <p style="margin:16px 0 0 0; color:{MUTED};">Open the console to promote children and invite newly created members.</p>
    """
    html = _wrap_brand_email(
        headline="Upcoming 18th birthdays",
        body_html=body_html,
        preview_text="Children approaching 18 — promotion digest",
        cta_label="Open promotions",
        cta_url=dashboard_url,
        footer_lines=["This reminder is generated automatically once per day."],
    )
    text_lines = ["Children approaching 18 (promotion digest):"]
    for item in items:
        text_lines.append(f"- {item['child_name']} — {item['turns_on']} (Guardian: {item['parent_name']}, Household: {item['household']})")
    text_lines.append(f"\nReview promotions: {dashboard_url}")
    return html, "\n".join(text_lines) + "\n"


def render_child_promoted_email(
    *,
    child: Child,
    parent: Member | None,
    new_member: Member,
    member_url: str,
) -> tuple[str, str]:
    parent_name = f"{parent.first_name} {parent.last_name}" if parent else "Unknown guardian"
    body_html = f"""
      <p style="margin:0 0 12px 0;">{child.full_name} just turned 18 and has been promoted to a member record.</p>
      <div style="margin-top:8px; padding:14px 16px; background:#f8fafc; border-radius:12px; border:1px solid #e5e7eb;">
        <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:{MUTED}; margin-bottom:6px;">New member</div>
        <div style="color:{TEXT}; line-height:1.6;">
          <strong>Member ID:</strong> #{new_member.id}<br>
          <strong>Name:</strong> {new_member.first_name} {new_member.last_name}<br>
          <strong>Origin:</strong> Promoted from {parent_name}'s household
        </div>
      </div>
      <p style="margin:16px 0 0 0; color:{MUTED};">Review the new member record and invite them to the console when ready.</p>
    """
    html = _wrap_brand_email(
        headline="Child promoted to member",
        body_html=body_html,
        preview_text=f"{child.full_name} promoted to member",
        cta_label="Review member",
        cta_url=member_url,
        footer_lines=["Triggered automatically when a promotion is applied."],
    )
    text = (
        f"{child.full_name} was promoted to a member record.\n"
        f"New member: {new_member.first_name} {new_member.last_name} (ID #{new_member.id})\n"
        f"Guardian: {parent_name}\n"
        f"Review member: {member_url}\n"
    )
    return html, text


def render_payment_reminder_email(
    *,
    member_name: str,
    amount: str,
    currency: str,
    due_date: str | None,
    service_label: str,
    pay_url: str | None,
) -> tuple[str, str]:
    due_line = f"Due by {due_date}" if due_date else "Due soon"
    body_html = f"""
      <p style="margin:0 0 12px 0;">Hi {member_name},</p>
      <p style="margin:0 0 16px 0;">This is a friendly reminder to complete your payment.</p>
      <div style="margin-top:8px; padding:14px 16px; background:#f8fafc; border-radius:12px; border:1px solid #e5e7eb;">
        <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:{MUTED}; margin-bottom:6px;">Payment</div>
        <div style="color:{TEXT}; line-height:1.6;">
          <strong>Service:</strong> {service_label}<br>
          <strong>Amount:</strong> {amount} {currency}<br>
          <strong>Status:</strong> Overdue<br>
          <strong>{due_line}</strong>
        </div>
      </div>
      <p style="margin:16px 0 0 0; color:{MUTED};">If you already paid, you can ignore this reminder.</p>
    """
    html = _wrap_brand_email(
        headline="Payment reminder",
        body_html=body_html,
        preview_text="Payment reminder",
        cta_label="Review payment" if pay_url else None,
        cta_url=pay_url,
        footer_lines=["Sent automatically as a courtesy reminder."],
    )
    text = (
        f"Payment reminder for {service_label}\n"
        f"Amount: {amount} {currency}\n"
        f"Status: Overdue\n"
    )
    if due_date:
        text += f"Due by: {due_date}\n"
    if pay_url:
        text += f"Review payment: {pay_url}\n"
    text += "If you already paid, you can ignore this reminder.\n"
    return html, text
