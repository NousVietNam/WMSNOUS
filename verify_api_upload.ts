
const csvData = [
    { boxCode: 'BOX-TEST-0002', sku: 'NB2S25-TB2-M04-OW-0M', quantity: 1 }
]

async function testUpload() {
    console.log("Testing API Upload...")
    try {
        const res = await fetch('http://localhost:3000/api/picking-jobs/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: csvData })
        })

        const text = await res.text()
        console.log("Status:", res.status)
        try {
            const json = JSON.parse(text)
            console.log("Body:", JSON.stringify(json, null, 2))
        } catch (e) {
            console.log("Body (Text):", text)
        }
    } catch (e) {
        console.error("Fetch Error:", e)
    }
}

testUpload()
