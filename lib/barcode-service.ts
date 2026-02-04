
import jimp from 'jimp';
import javascriptBarcodeReader from 'javascript-barcode-reader';

export async function decodeBarcodeFromBuffer(buffer: Buffer): Promise<string | null> {
    try {
        console.log('🖼 Processing image buffer for barcode...');
        const image = await jimp.read(buffer);

        // Optimize image for barcode reading if needed
        // grayscale() is often helpful
        image.grayscale().contrast(0.5);

        const result = await javascriptBarcodeReader({
            image: image.bitmap,
            width: image.bitmap.width,
            height: image.bitmap.height,
        });

        if (result) {
            console.log(`✅ Decoded barcode: ${result}`);
            return result;
        }

        // Try without grayscale/contrast just in case
        const rawImage = await jimp.read(buffer);
        const rawResult = await javascriptBarcodeReader({
            image: rawImage.bitmap,
            width: rawImage.bitmap.width,
            height: rawImage.bitmap.height,
        });

        return rawResult || null;
    } catch (error) {
        console.error('❌ Error decoding barcode:', error);
        return null;
    }
}
