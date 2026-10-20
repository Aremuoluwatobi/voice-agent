# 13. Internal-only rules — NOT in the vector database

These go into the system prompt and the tool code, never into searchable chunks (decided rule: internal-only documents are kept out of the knowledge source).

| **Rule** | **Value** |
| --- | --- |
| Low-risk actions (status, product questions) | Order ID + first name |
| High-risk actions (replacement, return, cancel, address change) | Order ID + last 4 digits of the phone number + delivery city |
| Failed identity checks | 2 attempts, then no account details are shared and a human is offered |
| Never ask for | Card number, PIN, OTP, passwords, full address read-back |
| AI may do | Give status, explain policy, troubleshoot, create return request, create damage replacement request (pending review), save callback |
| AI may never do | Approve refunds or credits, promise delivery dates for replacements, change prices, reveal other customers' data |
| Confirm-back (decided) | Repeat every order ID/name/date before using it and every number/decision before ending |
