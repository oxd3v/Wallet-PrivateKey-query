const puppeteer = require('puppeteer');

// Browser pool configuration
const MAX_CONCURRENT_PAGES = parseInt(process.env.MAX_CONCURRENT_PAGES) || 10;
const PAGE_TIMEOUT = parseInt(process.env.PAGE_TIMEOUT) || 30000;
const NAVIGATION_TIMEOUT = parseInt(process.env.NAVIGATION_TIMEOUT) || 60000;

// Global browser instance and page pool
let browser = null;
let pagePool = [];
let busyPages = new Set();

// Initialize browser with optimized settings
const initializeBrowser = async () => {
    if (browser) return browser;
    
    console.log('🌐 Initializing optimized browser...');
    
    browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ]
    });
    
    // Pre-create page pool
    for (let i = 0; i < MAX_CONCURRENT_PAGES; i++) {
        const page = await browser.newPage();
        
        // Optimize page settings
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36  Safari/537.36');
        await page.setViewport({ width: 1280, height: 720 });
        
        // Disable images and CSS for faster loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        pagePool.push(page);
    }
    
    console.log(`✅ Browser initialized with ${MAX_CONCURRENT_PAGES} pages`);
    return browser;
};

// Get available page from pool
const getPage = async () => {
    // Wait for available page
    while (pagePool.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    const page = pagePool.pop();
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
        
        return netWorth;
        
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
        
        // Close all pages
        const pages = await browser.pages();
        await Promise.all(pages.map(page => page.close().catch(() => {})));
        
        // Close browser
        await browser.close();
        browser = null;
        pagePool = [];
        busyPages.clear();
        
        console.log('✅ Browser closed');
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
