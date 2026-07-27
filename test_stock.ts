import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch, setDoc } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const stockSnapshot = await getDocs(collection(db, "stock"));
  const stockItems = [];
  stockSnapshot.forEach((doc) => {
    stockItems.push({ id: doc.id, ...doc.data() });
  });
  console.log("Found", stockItems.length, "items.");
  fs.writeFileSync('current_stock.json', JSON.stringify(stockItems, null, 2));
  console.log("Saved to current_stock.json");
}

run().catch(console.error);
