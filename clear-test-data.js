const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function clearTestData() {
    try {
        const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
        if (!fs.existsSync(serviceAccountPath)) {
            console.error("❌ Error: serviceAccountKey.json not found in root directory.");
            console.error("Please ensure you have downloaded your Firebase Admin SDK key and named it serviceAccountKey.json");
            process.exit(1);
        }

        const serviceAccount = require(serviceAccountPath);
        
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        
        const db = admin.firestore();
        
        console.log("🔥 Connected to Firestore. Starting test data deletion...");
        console.log("⚠️ WARNING: This will permanently delete all data in the specified collections.");

        // Function to delete all documents in a collection in batches
        async function deleteCollection(collectionPath) {
            const collectionRef = db.collection(collectionPath);
            const query = collectionRef.orderBy('__name__').limit(500);

            return new Promise((resolve, reject) => {
                deleteQueryBatch(db, query, resolve).catch(reject);
            });
        }

        async function deleteQueryBatch(db, query, resolve) {
            const snapshot = await query.get();

            const batchSize = snapshot.size;
            if (batchSize === 0) {
                // When there are no documents left, we are done
                resolve();
                return;
            }

            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            // Recurse on the next process tick, to avoid exploding the stack.
            process.nextTick(() => {
                deleteQueryBatch(db, query, resolve);
            });
        }

        const collectionsToDelete = ['bookings', 'users', 'services'];

        for (const col of collectionsToDelete) {
            console.log(`🗑️  Deleting all documents in collection: '${col}'...`);
            await deleteCollection(col);
            console.log(`✅ Collection '${col}' cleared.`);
        }

        // Reset Queue Counter
        console.log(`🔄 Resetting queue counter...`);
        await db.collection('settings').doc('queueCounter').set({
            currentNumber: 0,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Queue counter reset to 0 (Next queue will be A001).`);

        console.log("🎉 All test data cleared and system is ready for Production!");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error clearing data:", error);
        process.exit(1);
    }
}

clearTestData();
