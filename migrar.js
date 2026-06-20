// Script de migración: sube data.json y users.json a MongoDB Atlas
// Uso: node migrar.js
require("dotenv").config();
const mongoose = require("mongoose");
const fs       = require("fs");
const path     = require("path");

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) { console.error("❌ Falta MONGODB_URI en .env"); process.exit(1); }

const DataSchema = new mongoose.Schema({ _id: String, payload: mongoose.Schema.Types.Mixed });
const UserSchema = new mongoose.Schema({
  id: String, email: String, password: String, nivel: String
});
const DataModel = mongoose.model("AppData", DataSchema);
const UserModel = mongoose.model("AppUser", UserSchema);

async function migrar() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Conectado a MongoDB Atlas");

  // Migrar data.json
  const dataFile = path.join(__dirname, "data.json");
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    await DataModel.findByIdAndUpdate("main", { payload: data }, { upsert: true });
    console.log("✅ data.json migrado");
  } else {
    console.log("⚠️  data.json no encontrado, omitiendo");
  }

  // Migrar users.json
  const usersFile = path.join(__dirname, "users.json");
  if (fs.existsSync(usersFile)) {
    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    for (const u of users) {
      await UserModel.findOneAndUpdate({ id: u.id }, u, { upsert: true });
    }
    console.log(`✅ ${users.length} usuario(s) migrados`);
  } else {
    console.log("⚠️  users.json no encontrado, omitiendo");
  }

  await mongoose.disconnect();
  console.log("🎉 Migración completada");
}

migrar().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
