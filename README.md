# SitaRamam Night Mess

The repository is named SitaRamam; the customer-facing name follows the supplied Rassense Pvt Ltd printed night menu. QR ordering for students, a live kitchen queue, and an owner-only payment ledger. Uses Firebase Hosting, Firebase Authentication (anonymous customers and email/password staff), and Cloud Firestore on a dedicated project.

## Setup

1. Create a **new Firebase project**, separate from any hospital project. Enable Firestore in production mode and Authentication providers **Anonymous** and **Email/Password**.
2. Copy `.env.example` to `.env` and fill in the **new project's** web app settings. This config identifies the Firebase app, not an admin secret. Never add a service-account key to the repo.
3. `npm install && npm run dev`. The student page is `/`; the staff page is `/staff`.
4. Install Firebase CLI (`npm install -g firebase-tools`), then `firebase login` and `firebase use --add`. Select only the dedicated night-mess project. Deploy rules with `firebase deploy --only firestore:rules --project YOUR_NIGHT_MESS_PROJECT_ID`.
5. In Firebase Authentication, create your brother's email/password account and each kitchen account. Copy each account UID. In Firestore console create `staff/{UID}` with field `role` set to `owner` for your brother and `kitchen` for chefs. The app cannot create or alter these role documents.
6. Your brother signs in at `/staff` and uses **Load the 12 items from the printed menu**, then checks prices and availability. The menu shows 11:00 PM–3:00 AM and the printed estimate of 10–15 minutes; hours are informational and do not automatically disable ordering. Test on Firebase emulators before accepting actual orders. Build with `npm run build` and deploy with `firebase deploy --only hosting --project YOUR_NIGHT_MESS_PROJECT_ID`. Generate a QR for the deployed customer URL after testing.

The app deliberately has no Firebase project ID embedded in the repository. The actual project configuration must be supplied as environment variables. Do not connect this repository to the Family E-Card or HR portal project.

## Workflow

- Customer enters a name and selects 1–8 distinct menu items, up to 20 of each. Reviewing then placing creates an order with a six-character random order number; Firestore rejects collisions. The browser retains a pending number during retries to avoid duplicate orders when the connection drops.
- Kitchen moves the order New → Preparing → Ready → Given. Given time is stored server-side; the UI shows elapsed minutes.
- Payment is a separate owner-only document. An order with no payment document is unpaid, including when already given. Kitchen cannot read payment documents. The owner can mark paid and undo an incorrect payment mark.
- Print slip opens the browser print dialogue on the staff device. An unattended thermal print service is not included in this version.

## Before public launch

- Enable Firebase App Check with a reCAPTCHA Enterprise key and enforce it on Firestore/Auth after testing. Anonymous sign-in plus a public QR alone does **not** prevent spam orders. Monitor quota usage.
- Verify the order number, owner role, price validation, duplicate retry, payment isolation, and simultaneous orders in the Emulator Suite.
- The owner can filter orders by IST date, see all unpaid orders, and export a selected day as CSV. The dashboard still subscribes to all orders and all payments; add server-side dated queries and paging as history grows. The brother records cash or UPI manually. Reconcile those marks against actual receipts before relying on the CSV as a formal ledger.
- Hosting build-time `VITE_` variables must be present during `npm run build`. GitHub publishing/deployment workflow is intentionally absent until the dedicated Firebase project and its credentials exist.
