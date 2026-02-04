
try {
    const javascriptBarcodeReader = require('javascript-barcode-reader');
    console.log('✅ javascript-barcode-reader loaded:', typeof javascriptBarcodeReader);
    const jimp = require('jimp');
    console.log('✅ jimp loaded');
} catch (e) {
    console.error('❌ Error loading modules:', e.message);
}
