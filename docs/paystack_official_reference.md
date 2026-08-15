# Paystack Implementation Reference

## Transaction initialization and verification

Paystack requires server-side requests to send `Authorization: Bearer SECRET_KEY`. Transaction initialization accepts an amount in the currency subunit, an email, an optional unique reference, a callback URL, and optional metadata. Subscriptions are created by passing the Paystack plan code in the initialization request; the plan overrides the direct amount. Verify a transaction using the reference before granting access.

Source: [Paystack Transaction API](https://paystack.com/docs/api/transaction/)

## Installment subscriptions

Paystack monthly plans may use `invoice_limit` to cap the number of charges. A customer can be subscribed by initializing a transaction with the plan code. Subscription lifecycle events include `subscription.create`, `invoice.create`, `invoice.payment_failed`, `invoice.update`, and `subscription.disable`.

Source: [Paystack Subscriptions](https://paystack.com/docs/payments/subscriptions/)

## Webhooks

Paystack recommends webhooks rather than browser callbacks for payment confirmation. Webhook requests carry the `x-paystack-signature` header, which is an HMAC SHA512 signature of the request body using the secret key. The endpoint should validate the signature and return HTTP 200 quickly. The listed Paystack webhook source IPs are `52.31.139.75`, `52.49.173.169`, and `52.214.14.220`; these are for protecting the application webhook endpoint, not for allowlisting outgoing application traffic to Paystack.

Source: [Paystack Webhooks](https://paystack.com/docs/payments/webhooks/)
