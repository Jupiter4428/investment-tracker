const ASSET_TYPES = ['หุ้นไทย', 'หุ้นต่างประเทศ', 'กองทุนรวม', 'คริปโต', 'ทองคำ', 'พันธบัตร/ตราสารหนี้', 'อื่นๆ'];

const DEFAULT_TAX_RATES = {
  'หุ้นไทย': { gainRate: 0, gainNote: 'ยกเว้นภาษี (ขายในตลาดหลักทรัพย์)', divRate: 10, intRate: 0 },
  'หุ้นต่างประเทศ': { gainRate: 0, gainNote: 'ตามฐานภาษีเงินได้บุคคลธรรมดา หากนำเงินกลับเข้าประเทศ (ประเมินแยก)', divRate: 15, intRate: 15 },
  'กองทุนรวม': { gainRate: 0, gainNote: 'ยกเว้นภาษี (กองทุนรวมทั่วไป)', divRate: 10, intRate: 0 },
  'คริปโต': { gainRate: 15, gainNote: 'หัก ณ ที่จ่าย 15% ของกำไร', divRate: 15, intRate: 15 },
  'ทองคำ': { gainRate: 0, gainNote: 'ยกเว้นภาษี (ไม่ใช่ผู้ค้าทองเป็นอาชีพ)', divRate: 0, intRate: 0 },
  'พันธบัตร/ตราสารหนี้': { gainRate: 0, gainNote: 'กำไรจากการขายคืนอาจยกเว้น/ตามเงื่อนไข', divRate: 0, intRate: 15 },
  'อื่นๆ': { gainRate: 0, gainNote: 'พิจารณาตามประเภทสินทรัพย์จริง', divRate: 0, intRate: 0 },
};

// Stocks bucketed for P/E based cheap/expensive classification (ported from Smart-DCA config.py conventions)
const TECH_STOCKS = ['MSFT', 'GOOGL', 'NVDA', 'ASML', 'TSM'];
const VALUE_STOCKS = ['JNJ', 'PG', 'CVX'];
const HEDGE_SYMBOLS = ['GC=F', 'GLD'];

module.exports = { ASSET_TYPES, DEFAULT_TAX_RATES, TECH_STOCKS, VALUE_STOCKS, HEDGE_SYMBOLS };
