
import * as Jimp from 'jimp';
const javascriptBarcodeReader = require('javascript-barcode-reader');

export async function decodeBarcodeFromBuffer(buffer: Buffer): Promise<string | null> {
    try {
        console.log('🖼 Processing image buffer for barcode...');
        const image = await (Jimp as any).read(buffer);

        // Resize if too large to speed up and improve focus
        if (image.bitmap.width > 1200) {
            image.resize(1200, (Jimp as any).AUTO);
        }

        // Attempt 1: Grayscale + Moderate Contrast
        const img1 = image.clone().grayscale().contrast(0.6);
        let result = await tryDecode(img1);
        if (result) {
            console.log(`✅ Decoded barcode: ${result}`);
            return result;
        }

        // Attempt 2: High Contrast + B&W Threshold (helps with some barcodes)
        const img2 = image.clone().grayscale().contrast(0.9).posterize(2);
        result = await tryDecode(img2);
        if (result) {
            console.log(`✅ Decoded barcode: ${result}`);
            return result;
        }

        // Attempt 3: Original but resized
        result = await tryDecode(image);
        if (result) {
            console.log(`✅ Decoded barcode: ${result}`);
        }
        return result;

    } catch (error) {
        console.error('❌ Error decoding barcode:', error);
        return null;
    }
}

async function tryDecode(image: any): Promise<string | null> {
    try {
        const result = await javascriptBarcodeReader({
            image: image.bitmap,
            width: image.bitmap.width,
            height: image.bitmap.height,
        });
        return result || null;
    } catch {
        return null;
    }
}
