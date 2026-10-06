# SitaRamam Night Mess

The repository is named SitaRamam; the customer-facing name follows the supplied Rassense Pvt Ltd printed night menu. QR ordering for students, a live kitchen queue, and an owner-only payment ledger. Uses GitHub Pages, Firebase Authentication (anonymous customers and email/password staff), and Cloud Firestore on a dedicated project.

## Setup

1. Create a **new Firebase project**, separate from any hospital project. Enable Firestore in production mode and Authentication providers **Anonymous** and **Email/Password**.
2. Copy `.env.example` to `.env` and fill in the **new project's** web app settings. This config identifies the Firebase app, not an admin secret. Never add a service-account key to the repo.
3. `npm install && npm run dev`. The student page is `/`; the staff page is `/staff`.
4. Install Firebase CLI (`npm install -g firebase-tools`), then `firebase login` and `firebase use --add`. Select only the dedicated night-mess project. Deploy rules with `firebase deploy --only firestore:rules --project YOUR_NIGHT_MESS_PROJECT_ID`.
5. In Firebase Authentication, create your brother's email/password account and a separate kitchen account. Put their login emails in `VITE_OWNER_LOGIN_EMAIL` and `VITE_KITCHEN_LOGIN_EMAIL` before building. The staff page asks for station and password only; the matching email account is selected behind the scenes. Copy each account UID. In Firestore console create `staff/{UID}` with field `role` set to `owner` for your brother and `kitchen` for chefs. The app cannot create or alter these role documents.
6. GitHub Actions publishes every push to `main` to `https://siddharthaaryan.github.io/SitaRamam/`. Enable GitHub Pages with **GitHub Actions** as its source in repository Settings → Pages if needed. The owner signs in at `/SitaRamam/staff`; if the database menu is empty, the app automatically loads the 12 items transcribed from the printed menu. The owner then checks prices and availability. Existing non-empty menus are preserved. The menu shows 11:00 PM–3:00 AM and the printed estimate of 10–15 minutes; hours are informational and do not automatically disable ordering. Test one customer order and both staff accounts before displaying the QR. Firebase Hosting is separately configured but has no release; this workflow uses GitHub Pages.

The build workflow supplies the dedicated night-mess Firebase web configuration. Passwords and service-account keys must never be committed. Do not connect this repository to the Family E-Card or HR portal project.

## Workflow

- Customer enters a name and selects 1–8 distinct menu items, up to 20 of each. Reviewing then placing creates an order with a six-character random order number; Firestore rejects collisions. The browser retains a pending number during retries to avoid duplicate orders when the connection drops.
- After placement the student receives an itemised bill with a red UNPAID label, an amount-filled UPI QR, and an Open UPI app link. The recipient is decoded from the supplied Paytm counter QR. These are payment initiation options; they do not verify a transfer or change payment status. The bill records the unpaid status at placement; current payment records are maintained by the counter. There is no customer I paid control. Students can print/save their bill or reopen the last bill in the same browser session.
- Kitchen moves the order New → Preparing → Ready → Given. Given time is stored server-side; the UI shows elapsed minutes.
- Payment is a separate owner-only document. An order with no payment document is unpaid, including when already given. Kitchen cannot read payment documents. The owner can mark paid and undo an incorrect payment mark.
- Print slip opens the browser print dialogue on the staff device. An unattended thermal print service is not included in this version.

## Before public launch

- Enable Firebase App Check with a reCAPTCHA Enterprise key and enforce it on Firestore/Auth after testing. Anonymous sign-in plus a public QR alone does **not** prevent spam orders. Monitor quota usage.
- Verify the order number, owner role, price validation, duplicate retry, payment isolation, and simultaneous orders in the Emulator Suite.
- The owner can filter by IST day or month, search by name or order number, and filter paid/unpaid orders. Separate CSV exports cover orders placed and payments collected in that period. Collections include payments for earlier orders, with cash/UPI totals; order sales and outstanding amounts are shown separately. These are sales and collections records, not a profit calculation (expenses are not tracked). The dashboard still subscribes to all orders and all payments; add server-side dated queries and paging as history grows. The brother records cash or UPI manually. Reconcile those marks against actual receipts before relying on the CSV as a formal ledger.
- The GitHub Pages workflow includes Firebase web configuration and the two station email addresses. Firebase web configuration is public by design; passwords and service-account keys are never added to the repository. Restrict the Firebase API key to the project's required APIs if appropriate, and keep Firestore rules deployed.

## Validation

Run `npm test` and `npm run build`. The workflow checks customer order creation, owner-only payment controls, IST date rollover, late collections, month filters, and spreadsheet-safe exports before deployment. These tests use isolated DOM/database mocks; real staff authentication, deployed rules, printer behavior, and UPI app launch must also be verified on actual devices.

## Interface

Student screens use a violet/coral gradient hero, original SVG food illustrations, category filters, menu search, a mobile basket shortcut, and an itemised ticket-style checkout. Transitions and decorative motion respect `prefers-reduced-motion`; changes of ordering stage return to the top of the page. Quantity changes preserve the entered name. The owner dashboard uses restrained colours for live operations and accounting.

The printed menu is visible immediately as a preview when the database menu is empty. Basket totals can be calculated, but order placement is disabled until the live menu is activated. Known portions are included in the stored item names so kitchen slips and historical order records retain serving details.

## Mobile ordering and daily numbers
Customer navigation has no staff link. Staff use `/staff` directly. Mobile cards offer large Add to basket buttons and 48px quantity controls. New orders display numeric daily sequences (1, 2, 3...), restarting at midnight IST. The internal document ID stays separate from the displayed number, preventing collisions between dates. A Firestore transaction allocates the number and food record together; retrying the pending request reuses the existing order.

**Deployment prerequisite:** publish the repository's updated `firestore.rules` to project `night-mess-90b05`. GitHub Pages does not deploy Firebase rules. Until the counter read is allowed and the menu exists, customer checkout remains disabled. No Blaze plan or Cloud Functions are required. Existing historical orders keep their old identifiers.
