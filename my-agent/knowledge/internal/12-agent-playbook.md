---
doc_title: Agent playbook - common calls
sections: ['12']
audience: internal
trust: trusted
source: knowledge-file
---

# 12. Agent playbook — common calls  [audience: internal]

| **Call** | **Steps** |
| --- | --- |
| Where is my order? | Ask order ID → confirm back → lookup → read status + estimate → if delayed, apologise and explain section 4 delay rule |
| Item arrived damaged | Order ID → identity check (high-risk) → check delivered_at within 48 h → explain section 7 → create replacement request (pending review) → offer human if the customer wants more |
| Product not working | Identify product → troubleshooting from 3.1 → if still faulty, warranty (section 9) or damage (section 7) by date |
| Return / refund | Check delivered_at ≤ 7 days and product returnability → explain → start return request → refund approval = human |
| Change address / cancel | Identity check → only if status = processing → else explain after-dispatch options |
| Charged twice | Explain bank reversal (3 working days) → hand off |
