#!/usr/bin/env node

/**
 * Download Material Symbols font from Google Fonts
 * 
 * This script:
 * 1. Fetches the Google Fonts CSS with our icon subset
 * 2. Extracts the WOFF2 font URL from the response
 * 3. Downloads the WOFF2 file
 * 4. Generates a local CSS file pointing to the local font
 * 5. Server will then serve these files locally instead of hitting Google
 * 
 * Usage: npm install (runs automatically via postinstall)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================================================
// MATERIAL SYMBOLS ICONS - Add or remove icons here, they will be auto-sorted
// ============================================================================
const ICONS = [
    'account_circle',      // User account icon
    'build',               // Build/tools icon
    'cancel',              // Cancel/close icon
    'center_focus_strong', // Focus icon
    'chat',                // Chat/messaging icon
    'check_circle',        // Success/checkmark icon
    'cloud_queue',         // Cloud/network icon
    'event',               // Event/calendar icon
    'expand_more',         // Expand/dropdown icon
    'group',               // Group/people icon
    'language',            // Language/translation icon
    'laptop',              // Laptop/device icon
    'lightbulb',           // Ideas/suggestions icon
    'logout',              // Logout/exit icon
    'looks_3',             // Number 3 icon (question counter)
    'looks_4',             // Number 4 icon (question counter)
    'looks_5',             // Number 5 icon (question counter)
    'looks_one',           // Number 1 icon (question counter)
    'looks_two',           // Number 2 icon (question counter)
    'memory',              // Memory/info icon
    'person',              // Person/user icon
    'public',              // Public/web icon
    'search',              // Search icon
    'send',                // Send/submit icon
    'settings',            // Settings/configuration icon
    'syringe',             // Syringe icon (injection attack demo)
    'warning',             // Warning/alert icon
];

// Sort icons alphabetically
const SORTED_ICONS = ICONS.sort();
const ICON_NAMES = SORTED_ICONS.join(',');

console.log(`\n📝 Material Symbols Icons (${SORTED_ICONS.length} total):`);
console.log('=====================================');
SORTED_ICONS.forEach((icon, idx) => {
    console.log(`  ${(idx + 1).toString().padStart(2, '0')}. ${icon}`);
});
console.log('=====================================\n');

// ============================================================================
// END OF ICONS CONFIGURATION
// ============================================================================

const FONTS_DIR = path.join(__dirname, '../frontend/fonts');
const CSS_DIR = path.join(__dirname, '../frontend/css');
const FONT_FILE = path.join(FONTS_DIR, 'material-symbols-outlined.woff2');
const CSS_FILE = path.join(CSS_DIR, 'material-symbols-outlined.css');

console.log('📥 Downloading Material Symbols font from Google Fonts...\n');

// Create fonts directory
if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// Create CSS directory
if (!fs.existsSync(CSS_DIR)) {
    fs.mkdirSync(CSS_DIR, { recursive: true });
}

// Step 1: Fetch the Google Fonts CSS
const googleFontsUrl = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=${ICON_NAMES}&display=swap`;

console.log('Step 1: Fetching Google Fonts CSS...');

https.get(googleFontsUrl, (res) => {
    let cssData = '';

    res.on('data', (chunk) => {
        cssData += chunk;
    });

    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.error(`❌ Failed to fetch CSS (status ${res.statusCode})`);
            process.exit(1);
        }

        // Step 2: Extract the font URL from CSS
        const urlMatch = cssData.match(/src:\s*url\(([^)]+)\)\s*format/);
        if (!urlMatch) {
            console.error('❌ Could not extract font URL from CSS');
            process.exit(1);
        }

        const fontUrl = urlMatch[1];
        console.log('✓ Extracted font URL from Google Fonts CSS\n');

        // Step 3: Download the WOFF2 font
        console.log('Step 2: Downloading WOFF2 font file...');
        https.get(fontUrl, (fontRes) => {
            if (fontRes.statusCode !== 200) {
                console.error(`❌ Failed to download font (status ${fontRes.statusCode})`);
                process.exit(1);
            }

            const fontStream = fs.createWriteStream(FONT_FILE);

            fontRes.pipe(fontStream);

            fontStream.on('finish', () => {
                fontStream.close();

                const fileSize = (fs.statSync(FONT_FILE).size / 1024).toFixed(2);
                console.log(`✓ Downloaded font (${fileSize} KB)\n`);

                // Step 4: Generate local CSS file
                console.log('Step 3: Generating local CSS file...');
                const localCss = `/* Material Symbols Outlined - Downloaded from Google Fonts
 * Generated: ${new Date().toISOString()}
 * 
 * This CSS file points to the locally cached WOFF2 font.
 * Serves the same icons as Google Fonts but from your own server.
 */

@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal;
  font-weight: 100 700;
  font-display: swap;
  src: url('/fonts/material-symbols-outlined.woff2') format('woff2');
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}
`;

                fs.writeFileSync(CSS_FILE, localCss);
                console.log('✓ Created local CSS file\n');

                console.log('✅ Material Symbols font successfully downloaded and configured!\n');
                console.log('📍 Files created:');
                console.log(`   - ${FONT_FILE}`);
                console.log(`   - ${CSS_FILE}\n`);
                console.log('📝 Update your CSS to use: @import url(\'/fonts/material-symbols-outlined.css\');\n');
            });

            fontStream.on('error', (err) => {
                console.error(`❌ Error writing font file: ${err.message}`);
                process.exit(1);
            });
        }).on('error', (err) => {
            console.error(`❌ Error downloading font: ${err.message}`);
            process.exit(1);
        });
    });
}).on('error', (err) => {
    console.error(`❌ Error fetching Google Fonts CSS: ${err.message}`);
    process.exit(1);
});
