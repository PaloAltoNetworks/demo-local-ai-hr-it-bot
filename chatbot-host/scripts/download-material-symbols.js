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
// MATERIAL SYMBOLS FONT CONFIGURATION
// ============================================================================

// Font family to use: 'Material Symbols Outlined', 'Material Symbols Rounded', or 'Material Symbols Sharp'
const FONT_FAMILY = 'Material Symbols Rounded';

// Font axes configuration - variable font with ranges
const FONT_CONFIG = {
    opticalSize: '20..48',      // Optical size range (20dp to 48dp)
    fontWeight: '300',     // Font weight range (100 thin to 700 bold)
    fill: '1',               // Fill style range (0 = outlined, 1 = filled)
    grade: '-50..200',          // Grade/thickness adjustments (-50 to 200)
};

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
    'close',               // Close/x icon
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
    'security',            // Security/shield icon
    'send',                // Send/submit icon
    'settings',            // Settings/configuration icon
    'syringe',             // Syringe icon (injection attack demo)
    'warning',             // Warning/alert icon
    'dark_mode',           // Dark mode icon
    'light_mode',          // Light mode icon
    'unfold_less',        // Collapse icon
    'unfold_more',        // Expand icon
    'open_in_full',       // Open fullscreen icon
    'close_fullscreen',   // Close fullscreen icon
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

console.log(`⚙️  Font Configuration (${FONT_FAMILY}):`);
console.log(`  - Optical Size: ${FONT_CONFIG.opticalSize}`);
console.log(`  - Font Weight: ${FONT_CONFIG.fontWeight}`);
console.log(`  - Fill: ${FONT_CONFIG.fill}`);
console.log(`  - Grade: ${FONT_CONFIG.grade}\n`);

// ============================================================================
// END OF ICONS CONFIGURATION
// ============================================================================

const FONTS_DIR = path.join(__dirname, '../frontend/fonts');
const CSS_DIR = path.join(__dirname, '../frontend/css');

// Generate font filename based on font family (lowercase, with hyphens)
// CSS file is generic "material-symbols.css"
const FONT_FILENAME = FONT_FAMILY.toLowerCase().replace(/\s+/g, '-');
const FONT_FILE = path.join(FONTS_DIR, `${FONT_FILENAME}.woff2`);
const CSS_FILE = path.join(CSS_DIR, 'material-symbols.css');

console.log('Downloading Material Symbols font from Google Fonts...\n');

// Create fonts directory
if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// Create CSS directory
if (!fs.existsSync(CSS_DIR)) {
    fs.mkdirSync(CSS_DIR, { recursive: true });
}

// Step 1: Fetch the Google Fonts CSS
// Construct URL with variable font axes ranges
const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${FONT_FAMILY.replace(/\s+/g, '+')}:opsz,wght,FILL,GRAD@${FONT_CONFIG.opticalSize},${FONT_CONFIG.fontWeight},${FONT_CONFIG.fill},${FONT_CONFIG.grade}&icon_names=${ICON_NAMES}&display=swap`;

console.log('Step 1: Fetching Google Fonts CSS...');

console.log('\nGenerated URL:');
console.log(googleFontsUrl);
console.log();

const options = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
};

https.get(googleFontsUrl, options, (res) => {
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
        console.log('Extracted font URL from Google Fonts CSS\n');

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
                console.log(`Downloaded font (${fileSize} KB)\n`);

                // Step 4: Transform Google's CSS to use local font file
                console.log('Step 3: Generating local CSS file...');
                
                // Replace all Google Fonts URLs with local file reference
                // Use relative path since CSS is in /css/ and fonts are in /fonts/
                let localCss = cssData.replace(
                    /src:\s*url\([^)]+\)\s*format\('[^']+'\)/g,
                    `src: url('../fonts/${FONT_FILENAME}.woff2') format('woff2')`
                );

                // Replace Google's specific font class names with generic .material-symbols
                // This handles .material-symbols-rounded, .material-symbols-outlined, .material-symbols-sharp
                localCss = localCss.replace(
                    /\.(material-symbols-\w+)\s*\{/g,
                    '.material-symbols {'
                );

                fs.writeFileSync(CSS_FILE, localCss);
                console.log('Created local CSS file\n');

                console.log('Material Symbols font successfully downloaded and configured!\n');
                console.log('📍 Files created:');
                console.log(`   - ${FONT_FILE}`);
                console.log(`   - ${CSS_FILE}\n`);
                console.log(`📝 Update your CSS to use: @import url('/fonts/material-symbols.css');\n`);
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
