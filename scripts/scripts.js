import {
  sampleRUM,
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForLCP,
  loadBlocks,
  loadCSS,
  getMetadata,
  loadScript,
  toCamelCase,
  toClassName,
} from './aem.js';

const AUDIENCES = {
  mobile: () => window.innerWidth < 600,
  desktop: () => window.innerWidth >= 600,
  // define your custom audiences here as needed
  tiktok: () => window.innerWidth < 600 && URLSearchParams(window.location.search).get('utm_source') === 'tiktok',
};

/**
 * Gets all the metadata elements that are in the given scope.
 * @param {String} scope The scope/prefix for the metadata
 * @returns an array of HTMLElement nodes that match the given scope
 */
export function getAllMetadata(scope) {
  return [...document.head.querySelectorAll(`meta[property^="${scope}:"],meta[name^="${scope}-"]`)]
    .reduce((res, meta) => {
      const id = toClassName(meta.name
        ? meta.name.substring(scope.length + 1)
        : meta.getAttribute('property').split(':')[1]);
      res[id] = meta.getAttribute('content');
      return res;
    }, {});
}

// Define an execution context
const pluginContext = {
  getAllMetadata,
  getMetadata,
  loadCSS,
  loadScript,
  sampleRUM,
  toCamelCase,
  toClassName,
};

const LCP_BLOCKS = []; // add your LCP blocks to the list
window.hlx.RUM_GENERATION = 'project-1'; // add your RUM generation information here
/**
 * Determine if we are serving content for the block-library, if so don't load the header or footer
 * @returns {boolean} True if we are loading block library content
 */
export function isBlockLibrary() {
  return window.location.pathname.includes('block-library');
}

/**
 * Convience method for creating tags in one line of code
 * @param {string} tag Tag to create
 * @param {object} attributes Key/value object of attributes
 * @param {HTMLElement | HTMLElement[] | string} children Child element
 * @returns {HTMLElement} The created tag
 */
export function createTag(tag, attributes, children) {
  const element = document.createElement(tag);
  if (children) {
    if (children instanceof HTMLElement
      || children instanceof SVGElement
      || children instanceof DocumentFragment) {
      element.append(children);
    } else if (Array.isArray(children)) {
      element.append(...children);
    } else {
      element.insertAdjacentHTML('beforeend', children);
    }
  }
  if (attributes) {
    Object.entries(attributes).forEach(([key, val]) => {
      element.setAttribute(key, val);
    });
  }
  return element;
}

function buildHeroBlock(main) {
  const h1 = main.querySelector('main > div > h1');
  const picture = main.querySelector('main > div > p > picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

function patchDemoBlocks(config) {
  if (window.wknd.demoConfig.blocks && window.wknd.demoConfig.blocks[config.blockName]) {
    const url = window.wknd.demoConfig.blocks[config.blockName];
    const splits = new URL(url).pathname.split('/');
    const [, owner, repo, , branch] = splits;
    const path = splits.slice(5).join('/');

    const franklinPath = `https://little-forest-58aa.david8603.workers.dev/?url=https://${branch}--${repo}--${owner}.hlx.live/${path}`;
    return {
      ...config,
      jsPath: `${franklinPath}/${config.blockName}.js`,
      cssPath: `${franklinPath}/${config.blockName}.css`,
    };
  }
  return (config);
}

async function loadDemoConfig() {
  const demoConfig = {};
  const pathSegments = window.location.pathname.split('/');
  if (window.location.pathname.startsWith('/drafts/') && pathSegments.length > 4) {
    const demoBase = pathSegments.slice(0, 4).join('/');
    const resp = await fetch(`${demoBase}/theme.json?sheet=default&sheet=blocks&`);
    if (resp.status === 200) {
      const json = await resp.json();
      const tokens = json.data || json.default.data;
      const root = document.querySelector(':root');
      tokens.forEach((e) => {
        root.style.setProperty(`--${e.token}`, `${e.value}`);
        demoConfig[e.token] = e.value;
      });
      demoConfig.tokens = tokens;
      demoConfig.demoBase = demoBase;
      const blocks = json.blocks ? json.blocks.data : [];
      demoConfig.blocks = {};
      blocks.forEach((block) => {
        demoConfig.blocks[block.name] = block.url;
      });

      window.hlx.patchBlockConfig.push(patchDemoBlocks);
    }

    if (!demoConfig.demoBase) {
      const navCheck = await fetch(`${demoBase}/nav.plain.html`);
      if (navCheck.status === 200) {
        demoConfig.demoBase = demoBase;
      }
    }
  }
  window.wknd = window.wknd || {};
  window.wknd.demoConfig = demoConfig;
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);

  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * loads everything needed to get to LCP.
 */
async function loadEager(doc) {

  // block on main thread
  Array(100).fill().forEach(() => JSON.parse('[' + '0,'.repeat(1_000_000) + '0]'));

  if (getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length) {
    // eslint-disable-next-line import/no-relative-packages
    const { loadEager: runEager } = await import('../plugins/experimentation/src/index.js');
    await runEager(document, { audiences: AUDIENCES }, pluginContext);
  }

  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  // load demo config
  await loadDemoConfig();

  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    await waitForLCP(LCP_BLOCKS);
  }
}

/**
 * Adds the favicon.
 * @param {string} href The favicon URL
 */
export function addFavIcon(href) {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = href;
  const existingLink = document.querySelector('head link[rel="icon"]');
  if (existingLink) {
    existingLink.parentElement.replaceChild(link, existingLink);
  } else {
    document.getElementsByTagName('head')[0].appendChild(link);
  }
}

/**
 * loads everything that doesn't need to be delayed.
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadBlocks(main);

  const { hash } = window.location;
  const element = hash ? main.querySelector(hash) : false;
  if (hash && element) element.scrollIntoView();

  if (!isBlockLibrary()) {
    loadHeader(doc.querySelector('header'));
    loadFooter(doc.querySelector('footer'));
  }

  if (window.wknd.demoConfig.fonts) {
    const fonts = window.wknd.demoConfig.fonts.split('\n');
    fonts.forEach(async (font) => {
      const [family, url] = font.split(': ');
      const ff = new FontFace(family, `url('${url}')`);
      await ff.load();
      document.fonts.add(ff);
    });
  } else {
    loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  }
  addFavIcon(`${window.wknd.demoConfig.demoBase || window.hlx.codeBasePath}/favicon.png`);
  sampleRUM('lazy');
  sampleRUM.observe(main.querySelectorAll('div[data-block-name]'));
  sampleRUM.observe(main.querySelectorAll('picture > img'));

  // Add below snippet at the end of the lazy phase
  if ((getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length)) {
    // eslint-disable-next-line import/no-relative-packages
    const { loadLazy: runLazy } = await import('../plugins/experimentation/src/index.js');
    await runLazy(document, { audiences: AUDIENCES }, pluginContext);
  }
}

/**
 * loads everything that happens a lot later, without impacting
 * the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => {
    return import('./delayed.js');
  }, 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
