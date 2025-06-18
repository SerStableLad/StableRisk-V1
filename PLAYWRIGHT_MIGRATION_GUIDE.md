# 🎭 Puppeteer to Playwright Migration Guide

## 📋 **API Mapping Reference**

### **1. Import Statements**

```typescript
// ❌ Puppeteer (OLD)
import puppeteer, { Browser, Page } from 'puppeteer'

// ✅ Playwright (NEW)
import { chromium, Browser, Page } from 'playwright'
```

### **2. Browser Launch**

```typescript
// ❌ Puppeteer (OLD)
browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ],
  timeout: 30000
})

// ✅ Playwright (NEW)
browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ],
  timeout: 30000
})
```

### **3. Page Creation & Setup**

```typescript
// ❌ Puppeteer (OLD)
page = await browser.newPage()
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
await page.setViewport({ width: 1366, height: 768 })

// ✅ Playwright (NEW)
page = await browser.newPage({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  viewport: { width: 1366, height: 768 }
})
```

### **4. Navigation**

```typescript
// ❌ Puppeteer (OLD)
await page.goto(url, {
  waitUntil: 'networkidle2',
  timeout: 15000
})

// ✅ Playwright (NEW)
await page.goto(url, {
  waitUntil: 'networkidle',
  timeout: 15000
})
```

### **5. Content Evaluation**

```typescript
// ❌ Puppeteer (OLD)
const content = await page.evaluate(() => {
  return {
    html: document.documentElement.outerHTML,
    title: document.title,
    links: Array.from(document.querySelectorAll('a')).map(a => ({
      href: a.href,
      text: a.textContent?.trim() || ''
    }))
  }
})

// ✅ Playwright (NEW) - Same syntax!
const content = await page.evaluate(() => {
  return {
    html: document.documentElement.outerHTML,
    title: document.title,
    links: Array.from(document.querySelectorAll('a')).map(a => ({
      href: a.href,
      text: a.textContent?.trim() || ''
    }))
  }
})
```

### **6. Resource Cleanup**

```typescript
// ❌ Puppeteer (OLD)
if (page) {
  try {
    await page.close()
  } catch (e) {
    console.warn('Error closing page:', e)
  }
}
if (browser) {
  try {
    await browser.close()
  } catch (e) {
    console.warn('Error closing browser:', e)
  }
}

// ✅ Playwright (NEW) - Same syntax!
if (page) {
  try {
    await page.close()
  } catch (e) {
    console.warn('Error closing page:', e)
  }
}
if (browser) {
  try {
    await browser.close()
  } catch (e) {
    console.warn('Error closing browser:', e)
  }
}
```

---

## 🔄 **Migration Examples**

### **Example 1: js-scraper.ts scrapePage() method**

```typescript
// ❌ Puppeteer Implementation
async scrapePage(url: string, options: ScrapingOptions = {}): Promise<ScrapedContent> {
  let browser: Browser | null = null
  let page: Page | null = null
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 30000
    })
    
    page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0...')
    await page.setViewport({ width: 1366, height: 768 })
    
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 15000
    })
    
    // Wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, options.waitTime || 2000))
    
    const content = await page.evaluate(() => {
      return {
        html: document.documentElement.outerHTML,
        title: document.title,
        links: Array.from(document.querySelectorAll('a')).map(a => ({
          href: a.href,
          text: a.textContent?.trim() || ''
        }))
      }
    })
    
    return {
      success: true,
      html: content.html,
      links: content.links,
      loadTime: Date.now() - startTime,
      error: null
    }
  } catch (error) {
    // Error handling...
  } finally {
    // Cleanup...
  }
}

// ✅ Playwright Implementation
async scrapePage(url: string, options: ScrapingOptions = {}): Promise<ScrapedContent> {
  let browser: Browser | null = null
  let page: Page | null = null
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      timeout: 30000
    })
    
    page = await browser.newPage({
      userAgent: 'Mozilla/5.0...',
      viewport: { width: 1366, height: 768 }
    })
    
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: options.timeout || 15000
    })
    
    // Wait for dynamic content
    await page.waitForTimeout(options.waitTime || 2000)
    
    const content = await page.evaluate(() => {
      return {
        html: document.documentElement.outerHTML,
        title: document.title,
        links: Array.from(document.querySelectorAll('a')).map(a => ({
          href: a.href,
          text: a.textContent?.trim() || ''
        }))
      }
    })
    
    return {
      success: true,
      html: content.html,
      links: content.links,
      loadTime: Date.now() - startTime,
      error: null
    }
  } catch (error) {
    // Error handling... (same)
  } finally {
    // Cleanup... (same)
  }
}
```

---

## ⚡ **Key Differences & Improvements**

### **1. Performance Benefits**
- **Faster startup**: Playwright launches ~30% faster than Puppeteer
- **Lower memory usage**: ~20% less memory per browser instance
- **Better resource management**: More efficient cleanup

### **2. API Improvements**
- **Simplified page setup**: User agent and viewport in constructor
- **Better wait handling**: `waitForTimeout()` vs `setTimeout()`
- **Consistent naming**: `networkidle` vs `networkidle2`

### **3. Compatibility Notes**
- **Same evaluate() syntax**: No changes needed for content extraction
- **Same error handling**: Try/catch patterns remain identical
- **Same cleanup**: Page and browser close methods unchanged

---

## 🎯 **Migration Checklist**

### **Files to Update:**

#### **1. src/lib/services/js-scraper.ts**
- [ ] Replace `puppeteer` import with `chromium` from `playwright`
- [ ] Update `puppeteer.launch()` to `chromium.launch()`
- [ ] Combine `setUserAgent()` and `setViewport()` into `newPage()` options
- [ ] Replace `setTimeout()` with `page.waitForTimeout()`
- [ ] Update `networkidle2` to `networkidle`

#### **2. src/lib/services/transparency.ts**
- [ ] Replace `puppeteer` import with `chromium` from `playwright`
- [ ] Update `analyzeDashboardContent()` method
- [ ] Apply same changes as js-scraper.ts

#### **3. Dependencies**
- [ ] Install Playwright: `npm install playwright`
- [ ] Install browser: `npx playwright install chromium`
- [ ] Remove Puppeteer: `npm uninstall puppeteer` (after validation)

---

## 🧪 **Testing Strategy**

### **1. Compatibility Tests**
- [ ] Run baseline tests with current Puppeteer implementation
- [ ] Implement Playwright versions of same tests
- [ ] Compare content extraction accuracy
- [ ] Validate performance improvements

### **2. Validation Criteria**
- [ ] Content length within ±10% of Puppeteer results
- [ ] Link extraction accuracy 100%
- [ ] Title and meta extraction identical
- [ ] Error handling behavior consistent
- [ ] Performance same or better

### **3. Rollback Plan**
- [ ] Keep Puppeteer dependency until validation complete
- [ ] Use feature flags to switch between implementations
- [ ] Maintain identical interfaces for easy rollback

---

## 🚀 **Implementation Order**

1. **Install Playwright** and browser binaries
2. **Create playwright-scraper.ts** as copy of js-scraper.ts
3. **Apply API migrations** using the mapping above
4. **Test compatibility** with existing functionality
5. **Update transparency.ts** once playwright-scraper is validated
6. **Switch hybrid-scraper.ts** to use Playwright version
7. **Run comprehensive tests** on all affected functionality
8. **Remove Puppeteer** once migration is complete

---

## 💡 **Pro Tips**

### **Error Handling**
- Playwright has better error messages - preserve original error format for compatibility
- Timeout errors may have different stack traces - normalize in catch blocks

### **Performance Optimization**
- Use `page.waitForLoadState('networkidle')` for better control
- Consider `page.waitForSelector()` for specific elements instead of blanket timeouts

### **Browser Options**
- Playwright requires fewer launch args than Puppeteer
- Remove Puppeteer-specific args that don't exist in Playwright

---

This guide ensures a **safe, methodical migration** with **zero breaking changes** to existing functionality while gaining Playwright's performance benefits. 