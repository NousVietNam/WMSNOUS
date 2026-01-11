import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

// Init Supabase Service Role (if available) or Anon for now (needs RLS disabled or policy)
// Since we are server side, we ideally use Service Key. 
// For this MVP, we use the client envs. Warning: If RLS is strict, this might fail without auth.
// But we can assume user runs this locally or we use the anon key with open policy.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Path to the file on the user's machine (SERVER SIDE)
// Note: Next.js API runs in a Node environment, so we can access FS.
// HARDCODED PATH AS REQUESTED
const CSV_PATH = `C:\\Users\\Admin\\OneDrive - NU Viet Nam\\New folder\\App hangle\\Master_data_hang_hoa_New.csv`;

export async function POST() {
    try {
        if (!fs.existsSync(CSV_PATH)) {
            return NextResponse.json({ error: 'File not found at ' + CSV_PATH }, { status: 404 });
        }

        const fileContent = fs.readFileSync(CSV_PATH, 'utf8');

        // Parse CSV
        const { data, errors } = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim() // Trim headers
        });

        if (errors.length > 0 && data.length === 0) {
            return NextResponse.json({ error: 'Parse error', details: errors }, { status: 400 });
        }

        // Map Data
        // CSV Columns: "ID","D?i tu?ng","Thuong hi?u","Gi?i tnh","Ch?ng lo?i","Nhm hng","Ma t?ng","Ma mu","Ma chi ti?t","Barcode","Tn hng ha"
        // We need to map to: sku, barcode, name, image_url, + new fields
        // Note: The CSV headers might be garbled due to encoding (e.g., "D?i tu?ng").
        // We rely on Index if name is unstable, OR we try to match by key content.
        // Let's inspect the headers from the file content we read earlier:
        // "D?i tu?ng" -> Index 1
        // "Ma chi ti?t" -> SKU

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const productsToUpsert = (data as any[]).map(row => {
            // Helper to clean price "40,000" -> 40000
            const parsePrice = (str: string) => parseInt(str?.replace(/,/g, '') || '0');

            return {
                sku: row['Ma chi ti?t'] || row['Ma chi tiet'] || 'UNKNOWN-' + Math.random(),
                barcode: row['Barcode'] || null,
                name: row['Tn hng ha'] || row['Ten hang hoa'] || 'No Name',
                image_url: row['Link'] || null,

                // Extra Columns (mapped best effort)
                brand: row['Thuong hi?u'] || row['Thuong hieu'],
                category: row['Nhm hng'] || row['Nhom hang'],
                gender: row['Gi?i tnh'] || row['Gioi tinh'],
                size: row['Size'],
                unit: row['Don v?'] || row['Don vi'],
                price: parsePrice(row['Gi bn l?'] || row['Gia ban le']),
                season: row['Ma bn hng'] || row['Mua ban hang'],

                // Dump rest
                other_details: {
                    id_ref: row['ID'],
                    color_code: row['Ma mu'],
                    material: row['Ch?t li?u'],
                    note: row['Note']
                }
            };
        }).filter(p => p.sku && !p.sku.startsWith('UNKNOWN')); // Basic filter

        if (productsToUpsert.length === 0) {
            return NextResponse.json({ message: 'No valid products found to insert' });
        }

        // Batch Insert (Supabase limit is usually huge, but safe to split if needed. 1000 is fine)
        const { error } = await supabase.from('products').upsert(productsToUpsert, {
            onConflict: 'sku'
        });

        if (error) throw error;

        return NextResponse.json({
            message: `Processed ${productsToUpsert.length} products successfully.`,
            sample: productsToUpsert[0]
        });

    } catch (error: any) {
        console.error('Import Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
