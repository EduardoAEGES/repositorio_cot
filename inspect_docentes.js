const fs = require('fs');

async function inspectDocentesCarga() {
    const spreadsheetId = '1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w';
    const gid = '1460914670';
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    
    try {
        const response = await fetch(url);
        const text = await response.text();
        const rows = text.split('\n');
        
        console.log('Headers:');
        console.log(rows[0]);
        console.log('First 5 rows:');
        for (let i = 1; i <= 5 && i < rows.length; i++) {
            console.log(rows[i]);
        }
    } catch (e) {
        console.error('Error fetching sheets:', e);
    }
}

inspectDocentesCarga();
