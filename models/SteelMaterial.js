const mongoose = require('mongoose');

// Steel Material 스키마 정의
const steelMaterialSchema = new mongoose.Schema({
  spec: { type: String, required: true },
  wpm: { type: Number, required: true },
  product: { type: String, required: true },
  method_calc: { type: Number, required: true },
  initial_length: { type: Number, required: true },
  trade_unit: { type: Number, required: true },
  cat_product: { type: Number, required: true }
}, {
  collection: 'steel_materials',
  timestamps: false
});

const SteelMaterial = mongoose.model('SteelMaterial', steelMaterialSchema);

module.exports = SteelMaterial;

