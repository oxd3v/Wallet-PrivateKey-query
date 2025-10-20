
//const { firefox, webkit, chromium } = require('playwright');
//const BROWSER_ENGINE = (process.env.BROWSER_ENGINE || 'firefox').toLowerCase();
const puppeteer = require('puppeteer');

// Browser pool configuration
const MAX_CONCURRENT_PAGES = parseInt(process.env.MAX_CONCURRENT_PAGES) || 10;
const PAGE_TIMEOUT = parseInt(process.env.PAGE_TIMEOUT) || 30000;
const NAVIGATION_TIMEOUT = parseInt(process.env.NAVIGATION_TIMEOUT) || 60000;

// Global browser instance and page/context pool
let browser = null;
let contextPool = [];
let pagePool = [];
let busyPages = new Set();

// Block non-essential resources to speed up page loads
const requestHandler = (req) => {
    const type = req.resourceType();
    if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
        req.abort();
    } else {
        req.continue();
    }
};

// Configure a page with sane defaults and performance optimizations
const configurePage = async (page) => {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    page.setDefaultTimeout(PAGE_TIMEOUT);
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
    await page.setRequestInterception(true);
    page.removeAllListeners('request');
    page.on('request', requestHandler);
};

// Initialize browser with optimized settings
const initializeBrowser = async () => {
    if (browser) return browser;

    console.log('🌐 Initializing optimized browser (Puppeteer)...');

    // Select engine based on env
    //const engine = BROWSER_ENGINE === 'webkit' ? webkit : BROWSER_ENGINE === 'chromium' ? chromium : firefox;

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    // Pre-create page pool with optimized settings
    for (let i = 0; i < MAX_CONCURRENT_PAGES; i++) {
        const page = await browser.newPage();
        await configurePage(page);
        pagePool.push(page);
    }

    console.log(`✅ Browser initialized with ${MAX_CONCURRENT_PAGES} pages`);
    return browser;
};

// Get available page from pool
const getPage = async () => {
    // Ensure browser and pool are ready
    if (!browser || pagePool.length === 0) {
        await initializeBrowser();
    }

    // Wait for available page
    while (pagePool.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    let page = pagePool.pop();
    // Replace closed pages with fresh ones
    if (page.isClosed && page.isClosed()) {
        page = await browser.newPage();
        await configurePage(page);
    }

    busyPages.add(page);
    return page;
};

// Return page to pool
const returnPage = (page) => {
    if (busyPages.has(page)) {
        busyPages.delete(page);
        pagePool.push(page);
    }
};

// Optimized portfolio value checking
const getPortFolioValue = async ({ walletAddress }) => {
    let page = null;

    try {
        page = await getPage();

        // Navigate to wallet page with timeout
        await page.goto(`https://zapper.xyz/account/${walletAddress}`, {
            waitUntil: 'domcontentloaded',
            timeout: NAVIGATION_TIMEOUT
        });

        // Wait for net worth element with shorter timeout
        await page.waitForSelector('[data-testid="net-worth"]', {
            timeout: PAGE_TIMEOUT
        });

        const netWorth = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="net-worth"]');
            if (!el) return null;
            return el.innerText.trim();
        });
        console.log(netWorth);
        return netWorth || '$0';

    } catch (error) {
        // Handle common errors gracefully
        if (error.name === 'TimeoutError') {
            return '$0'; // Assume no funds if timeout
        }
        throw error;
    } finally {
        if (page) {
            // Clear page state for reuse
            try {
                await page.evaluate(() => {
                    // Clear any potential memory leaks
                    window.stop();
                });
            } catch (e) {
                // Ignore cleanup errors
            }
            returnPage(page);
        }
    }
};

// Close browser and cleanup
const closeBrowser = async () => {
    if (browser) {
        console.log('🔄 Closing browser...');
        try {
            // Close contexts and pages
            await Promise.all(pagePool.map(page => page.close().catch(() => {})));
            await browser.close();
        } finally {
            browser = null;
            contextPool = [];
            pagePool = [];
            busyPages.clear();
            console.log('✅ Browser closed');
        }
    }
};

// Health check for browser
const isBrowserHealthy = () => {
    return browser && browser.isConnected();
};

// Get browser statistics
const getBrowserStats = () => {
    return {
        totalPages: MAX_CONCURRENT_PAGES,
        availablePages: pagePool.length,
        busyPages: busyPages.size,
        isHealthy: isBrowserHealthy()
    };
};

module.exports = {
    getPortFolioValue,
    initializeBrowser,
    closeBrowser,
    isBrowserHealthy,
    getBrowserStats
};

// Example usage (commented out):
// getPortFolioValue({walletAddress: '0x5853ed4f26a3fcea565b3fbc698bb19cdf6deb85'});
