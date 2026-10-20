# 14. Order dataset (Phase 4 seed data)

PROPOSED storage: fastapi-backend/data/orders.json (read-only, ships with each deploy). Changes during calls (return_requested, replacement_requested, callback) go to Upstash Redis, not the file.

| **Order** | **Customer** | **Phone last 4** | **City** | **Ordered** | **Items** | **Total** | **Pay** | **Status** | **Delivered** | **Test purpose** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 48213-NG | Adaeze Okafor | 4417 | Ikeja, Lagos | 2026-10-10 | 1× SoundDrop Wireless Earbuds (Black) | ₦41,000 | card | delivered | 2026-10-12 | MOCKUP ORDER: box crushed, earbuds don't charge (within 48 h on 10-13; damage batch 10–12 Oct) |
| 48214-NG | Tunde Bakare | 2209 | Lekki, Lagos | 2026-10-14 | 1× PowerCell 20,000 mAh PD Power Bank (Black) | ₦32,400 | card | dispatched | — | Normal in-transit status question |
| 48215-NG | Chiamaka Eze | 7731 | Enugu, Enugu | 2026-10-03 | 1× PulseFit Smartwatch (Rose) | ₦50,500 | transfer | delayed | — | Delayed: estimate was 2026-10-09; delivery-fee refund eligible |
| 48216-NG | Ibrahim Musa | 5120 | Kano, Kano | 2026-10-15 | 1× BassLine Over-Ear Headphones (Navy) | ₦57,500 | card | processing | — | Can still cancel / change address |
| 48217-NG | Funmi Adeyemi | 3348 | Ibadan, Oyo | 2026-09-20 | 1× SoundDrop Pro ANC Earbuds (Black) | ₦68,000 | card | delivered | 2026-09-23 | Past 7-day return window; within 12-month warranty |
| 48218-NG | Emeka Obi | 9902 | Port Harcourt, Rivers | 2026-10-01 | 1× QuickCharge 20 W USB-C Charger (White); 1× USB-C to USB-C Cable, 1 m (White) | ₦19,500 | card | delivered | 2026-10-05 | Asks why charger has no cable (FAQ) |
| 48219-NG | Adaeze Okafor | 4417 | Ikeja, Lagos | 2026-10-13 | 1× ClearGuard Shockproof Case, iPhone 15 (Clear) | ₦10,000 | pod | dispatched | — | SECOND order for the same customer → disambiguation |
| 48220-NG | Zainab Bello | 6610 | Abuja, FCT | 2026-10-08 | 2× BoomBox Mini Bluetooth Speaker (Blue) | ₦59,500 | card | delivered | 2026-10-14 | Stereo pairing question |
| 48221-NG | Kelechi Nwosu | 1185 | Surulere, Lagos | 2026-10-11 | 1× SoundDrop Wireless Earbuds (White) | ₦41,000 | card | delivered | 2026-10-12 | Damage batch; reports on 10-15 → OUTSIDE 48 h → warranty route |
| 48222-NG | Bisi Ogunleye | 4073 | Abeokuta, Ogun | 2026-10-09 | 1× PowerCell 10,000 mAh Power Bank (Black) | ₦22,500 | transfer | failed_delivery | — | Two failed attempts; returned to warehouse |
| 48223-NG | Samuel Okon | 8854 | Uyo, Akwa Ibom | 2026-10-02 | 1× Creator Tripod with Ring Light (Black) | ₦20,500 | card | cancelled | — | Cancelled before dispatch; refund processed 2026-10-04 |
| 48224-NG | Grace Ajayi | 2296 | Yaba, Lagos | 2026-10-12 | 1× SoundDrop Pro ANC Earbuds (Black); 1× USB-C to USB-C Cable, 1 m (White) | ₦68,500 | card | delivered | 2026-10-13 | Charged twice claim → handoff |
| 48225-NG | Musa Abdullahi | 7402 | Kaduna, Kaduna | 2026-10-06 | 1× PulseFit Smartwatch (Black) | ₦50,500 | card | delivered | 2026-10-10 | Watch not syncing (FAQ) |
| 48226-NG | Ngozi Umeh | 3019 | Ikoyi, Lagos | 2026-10-15 | 1× BassLine Over-Ear Headphones (Black); 1× BoomBox Mini Bluetooth Speaker (Black) | ₦79,000 | card | processing | — | Wants to change colour before dispatch |
| 48227-NG | Daniel Okoro | 5567 | Benin City, Edo | 2026-09-28 | 1× PowerCell 20,000 mAh PD Power Bank (Grey) | ₦35,400 | card | returned | 2026-10-02 | Change-of-mind return received; refund pending human approval |
| 48228-NG | Aisha Lawal | 9311 | Ilorin, Kwara | 2026-10-12 | 1× SoundDrop Wireless Earbuds (Black) | ₦44,000 | transfer | dispatched | — | Non-English caller (Yoruba) test |
| 48229-NG | Femi Oladipo | 6142 | Ikeja, Lagos | 2026-10-16 | 2× USB-C to Lightning Cable, 1 m (White) | ₦12,000 | card | ready_for_pickup | — | Pickup order ready |
| 48230-NG | Halima Sani | 2780 | Jos, Plateau | 2026-10-07 | 1× SoundDrop Pro ANC Earbuds (Black) | ₦69,500 | card | delivered | 2026-10-13 | Lost one earbud (not covered; single bud ₦20,000) |
| 48231-NG | Chidi Anozie | 4825 | Owerri, Imo | 2026-10-14 | 1× BoomBox Mini Bluetooth Speaker (Black) | ₦32,500 | pod | processing | — | INVALID: pay on delivery outside Lagos → data-quality test, agent should not invent |
| 48232-NG | Yemi Alade | 1953 | Ajah, Lagos | 2026-10-05 | 1× PowerCell 10,000 mAh Power Bank (Black) | ₦21,000 | pod | delivered | 2026-10-06 | Power bank swelling → warranty, safety advice |
| 48233-NG | Rukayat Salami | 8098 | Osogbo, Osun | 2026-10-13 | 1× SoundDrop Wireless Earbuds (Black); 1× QuickCharge 20 W USB-C Charger (White) | ₦52,000 | card | in_transit | — | Normal |
| 48234-NG | Obinna Chukwu | 3376 | Onitsha, Anambra | 2026-09-15 | 1× BassLine Over-Ear Headphones (Black) | ₦57,500 | card | delivered | 2026-09-19 | One side silent → warranty claim |
| 48235-NG | Tola Fashola | 7064 | Ikorodu, Lagos | 2026-10-15 | 1× PulseFit Smartwatch (Rose); 1× SoundDrop Pro ANC Earbuds (Black) | ₦109,000 | card | dispatched | — | Order total over ₦50,000 → free Lagos delivery |
| 48236-NG | Uche Ibe | 5531 | Aba, Abia | 2026-10-09 | 2× ClearGuard Shockproof Case, iPhone 15 (Clear) | ₦20,500 | transfer | cancelled | — | Unpaid transfer auto-cancelled after 24 h |
| 48237-NG | Amaka Nnaji | 9620 | Lekki, Lagos | 2026-10-11 | 1× SoundDrop Wireless Earbuds (Black) | ₦41,000 | card | delivered | 2026-10-12 | Damage batch, reports within 48 h (second replacement case) |
| 48238-NG | Segun Ojo | 2417 | Akure, Ondo | 2026-10-10 | 1× Creator Tripod with Ring Light (Black) | ₦19,000 | card | delivered | 2026-10-14 | Change-of-mind return within 7 days, sealed |
| 48239-NG | Hauwa Garba | 6803 | Maiduguri, Borno | 2026-10-04 | 1× PowerCell 20,000 mAh PD Power Bank (Black) | ₦35,400 | card | delayed | — | Courier delay email (kb/courier) explains it |
| 48240-NG | Bola Adebayo | 1349 | Ikeja, Lagos | 2026-10-16 | 2× SoundDrop Wireless Earbuds (White) | ₦77,000 | card | processing | — | Wants address change → allowed (before dispatch) |
| 48241-NG | Ifeoma Okeke | 4588 | Asaba, Delta | 2026-10-08 | 3× USB-C to USB-C Cable, 1 m (White) | ₦19,000 | card | delivered | 2026-10-12 | Opened cables, change of mind → not returnable |
| 48242-NG | Peter Adeleke | 7215 | Ikeja, Lagos | 2026-10-14 | 1× SoundDrop Pro ANC Earbuds (Black) | ₦64,000 | card | delivered | 2026-10-15 | Injection-test customer (see email EM-19) |

**Note. **test_note is for testing only and must be removed (or ignored) by the lookup tool before data reaches the LLM.

Statuses: processing, dispatched, in_transit, delayed, delivered, failed_delivery, ready_for_pickup, cancelled, returned.
