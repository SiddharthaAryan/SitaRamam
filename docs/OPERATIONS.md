# Night Mess: economical operation and launch gates

## Implemented
- A service day is 06:00 IST through 05:59:59 the following morning. Order numbering resets at 06:00. Existing records are retained; time-based queries include legacy records, but targeted orderDay lookups follow the value originally stored on legacy orders.
- Student menu browsing needs no anonymous account. The menu is fetched once, with a five-minute browser cache; reopening within that interval requires no menu read. Menu/prices/availability are still validated by database rules when placing an order. A cached sold-out item can therefore be rejected at checkout.
- Live order listeners are restricted to the selected service day and the most recent 200 documents. Older orders load in pages of 200 using document cursors; no offsets. Search filtering is local to loaded orders. The explicit saved-order lookup uses the exact name or order number within the selected orderDay and returns at most 50 matches.
- Payment listeners cover the selected service day, not the entire payment collection. Historical pages resolve late payment records only for the loaded orders. No payment subscription exists on the chef route.
- Full-service-night and monthly counts, sales and collections use on-demand count/sum queries. They download summary values, not every order. The loaded-order dashboard and its detailed exports are explicitly scoped to loaded records; load older pages when a full item-level export is needed. Monthly aggregate export includes exact period totals. Collections and sales use different event times, so their difference must not be labelled unpaid balance.
- A normal paid order still uses two creation writes (order + counter) and one payment write. No extra per-order summary writes or timer writes were added. The payment ledger remains separate for owner-only access.
- Numbering retries keep the same order identity. Cross-document-rule rejections retry only after a fresh transactional read confirms another order advanced the counter. Genuine validation failures are not blindly retried. The retry has a finite attempt limit; connectivity failures keep the pending order ID for manual retry/recovery.
- Chef elapsed-time updates are local computations and cost no database reads. There is no served button, so new orders' timers do not stop automatically.
- Index configuration excludes order item payloads from indexing. This saves index storage only after deploying that configuration; it is not a reduction in billed document writes.

## Hosting preparation
The existing GitHub Pages deployment remains a demo URL until the hosting migration is authorised. The repository remains on GitHub.

The manual `Publish to Firebase Hosting` workflow builds with `DEPLOY_TARGET=firebase` (root paths), tests the application and deploys to `night-mess-90b05`. It requires the repository secret `FIREBASE_SERVICE_ACCOUNT_NIGHT_MESS`, configured through a secure Firebase/GitHub deployment setup. Never paste a service-account private key into chat or commit it.

Firebase configuration includes SPA rewrites and long-lived immutable caching for hashed assets. The equivalent authenticated CLI steps are:

```
DEPLOY_TARGET=firebase npm run build
firebase deploy --project night-mess-90b05 --only hosting,firestore:indexes
```

The build also requires the VITE Firebase and station configuration shown in the workflow. The deployment identity needs Hosting deployment access and permission to manage Firestore indexes. Reporting requires the supplied aggregate indexes to finish building. No production database rules change is required by this update.

## Validation
```
npm test
npm run build
npx firebase-tools@14.0.0 emulators:exec --project demo-nightmess --config firebase.emulator.json --only auth,firestore 'node scripts/load-test.mjs'
```
The load script always uses loopback addresses and a demo project. Its default is 1,000 orders over ten concurrent clients with the checked-in security rules. The final local run on 15 October 2026 completed 1,000/1,000 orders with 1,000 unique numbers and no failures in 12.487 seconds; this was not a production-network measurement. It must never be redirected to production. Emulator throughput is not a production capacity guarantee.

## Still required before full launch
1. Authorise Firebase Hosting deployment; the development CLI currently has no Firebase login. Verify the new live URL before printing its QR.
2. Confirm the project's billing plan and shared-IP anonymous-account creation quota in Firebase. Delaying sign-up reduces browsing-only accounts but cannot bypass Firebase's account-creation limit. Test actual campus Wi-Fi and request an appropriate quota increase if necessary.
3. Test real phones, dropped/reconnected internet, two simultaneous real orders, and the physical printer. Database emulators cannot validate the campus network or printer.
4. Configure billing notifications and usage monitoring. Blaze free allowances are not a hard spending cap. Stored records, egress, abuse and traffic beyond allowances can incur charges.
5. Clear test data only when the owner explicitly requests launch cleanup. No production orders are deleted by this update.

## Data retention
Retain the original order and payment documents for accounting. Do not silently delete older records just to reduce reads: the scoped queries already avoid loading them. Any future archival/deletion policy must preserve item-level exports, payment dates and audit evidence, and be agreed before deletion.

## Live Firebase setup, 15 October 2026
Both aggregation indexes (orders: createdAt + total; payments: paidAt + amount) were created through Firebase Console and visibly reached Enabled. The orders.items single-field exemption was also saved with ascending, descending and arrays disabled. Billing remained Spark.

The cloud browser can access Firebase Console but displays Site Unavailable for both shell.cloud.google.com and console.cloud.google.com. Hosting is therefore still not deployed. `scripts/deploy-cloud-shell.sh` is a prepared, syntax-checked deployment script for the owner's own Google Cloud Shell. It does not alter billing, database rules or production order records. It runs tests and builds with the Firebase-root path before deploying only Hosting.
