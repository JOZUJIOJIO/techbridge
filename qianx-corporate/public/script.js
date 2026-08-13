(() => {
  'use strict';

  const root = document.documentElement;
  const isEnglish = root.lang.toLowerCase().startsWith('en');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setActive = (items, selected) => {
    items.forEach((item) => {
      const active = item === selected;
      item.classList.toggle('active', active);
      const control = item.matches('button') ? item : item.querySelector('button');
      if (control) control.setAttribute('aria-expanded', String(active));
    });
  };

  // Header: reading progress, active section state and a real mobile navigation surface.
  const header = document.querySelector('.site-header');
  const nav = document.querySelector('#primary-nav');
  const menuToggle = document.querySelector('.menu-toggle');
  const progress = document.querySelector('.scroll-progress i');
  const syncScroll = () => {
    if (progress) {
      const available = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      progress.style.transform = `scaleX(${Math.min(1, scrollY / available)})`;
    }
    header?.classList.toggle('scrolled', scrollY > 12);
  };
  syncScroll();
  addEventListener('scroll', syncScroll, { passive: true });

  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('aria-label', isEnglish ? 'Open site menu' : '打开网站目录');
  };
  menuToggle?.addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open
      ? (isEnglish ? 'Close site menu' : '关闭网站目录')
      : (isEnglish ? 'Open site menu' : '打开网站目录'));
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  addEventListener('keydown', ({ key }) => { if (key === 'Escape') closeMenu(); });
  addEventListener('resize', () => { if (innerWidth > 900) closeMenu(); }, { passive: true });

  const navLinks = [...document.querySelectorAll('#primary-nav a[href^="#"]')];
  const navSections = navLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  let navFrame = 0;
  const updateCurrentNav = () => {
    const readingLine = Math.min(220, innerHeight * 0.28);
    const currentSection = navSections.reduce((current, section) =>
      section.getBoundingClientRect().top <= readingLine ? section : current, null);
    navLinks.forEach((link) => {
      const current = Boolean(currentSection && link.getAttribute('href') === `#${currentSection.id}`);
      link.classList.toggle('current', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    navFrame = 0;
  };
  const queueCurrentNav = () => {
    if (!navFrame) navFrame = requestAnimationFrame(updateCurrentNav);
  };
  updateCurrentNav();
  addEventListener('scroll', queueCurrentNav, { passive: true });
  addEventListener('resize', queueCurrentNav, { passive: true });
  addEventListener('hashchange', queueCurrentNav);

  // Product matrix: expose the business problem, current capability and next proof point.
  const productCopy = isEnglish ? {
    materials: ['01', 'Trade Materials AI', 'CORE BUILT',
      'Global teams need a steady flow of product imagery, marketing copy and market-specific expression.',
      'Product assets, copy and localization move through one repeatable AI content workflow.',
      'Complete the product entry point, delivery boundary and formal release status.'],
    buyers: ['02', 'Buyer Discovery System', 'IN DEVELOPMENT',
      'B2B teams lose time identifying the right companies, decision-makers and credible reasons to engage.',
      'ICP definition, company research and LinkedIn prospect discovery are being connected into one workflow.',
      'Prove repeatable lead quality and a human-reviewed outreach loop with live campaigns.'],
    content: ['03', 'Content & Practice Network', 'IN DEVELOPMENT',
      'Trade teams struggle to turn market signals into useful content and validated operating knowledge.',
      'Trend intelligence, content workflows and field review are being organized around real commercial work.',
      'Launch the first structured content intelligence loop before expanding the practitioner network.']
  } : {
    materials: ['01', '外贸 AI 素材通', 'CORE BUILT / 核心已开发',
      '外贸团队需要持续生产商品图、营销文案与不同市场的本地化表达。',
      '把图片、文案与多市场适配收进同一条可重复的 AI 内容生产链路。',
      '完善产品入口、交付边界与正式公开发布状态。'],
    buyers: ['02', '自动找客户系统', 'IN DEVELOPMENT / 开发中',
      'B2B 团队需要更快识别对的企业、决策者，以及可信的接触理由。',
      '正在把 ICP 定义、企业研究与 LinkedIn 客户发现连接为一条工作流。',
      '用真实获客任务证明线索质量，并跑通人工审核的外联闭环。'],
    content: ['03', '内容与实战社群', 'IN DEVELOPMENT / 开发中',
      '外贸团队难以把市场信号持续转化为有用内容与经过验证的经营知识。',
      '围绕真实业务，组织趋势情报、内容生产工作流与实战复盘。',
      '先跑通内容情报闭环，再逐步扩展操盘者协作网络。']
  };
  const productCards = [...document.querySelectorAll('.product-card[data-product]')];
  const productDetail = document.querySelector('#product-detail');
  const updateProduct = (card) => {
    const data = productCopy[card.dataset.product];
    if (!data || !productDetail) return;
    setActive(productCards, card);
    productDetail.classList.remove('detail-updated');
    productDetail.innerHTML = `
      <div class="product-detail-head"><p>SELECTED PRODUCT / ${data[0]}</p><h3>${data[1]}</h3><span>${data[2]}</span></div>
      <div class="product-detail-grid">
        <div><b>USER PROBLEM</b><p>${data[3]}</p></div>
        <div><b>CURRENT CAPABILITY</b><p>${data[4]}</p></div>
        <div><b>NEXT MILESTONE</b><p>${data[5]}</p></div>
      </div>`;
    requestAnimationFrame(() => productDetail.classList.add('detail-updated'));
  };
  productCards.forEach((card) => card.querySelector('.card-hit')?.addEventListener('click', () => updateProduct(card)));

  // Architecture: turn a decorative sequence into an explanatory decision model.
  const architectureCopy = isEnglish ? [
    ['ROLE', 'Create cash flow and first-hand demand evidence through services.', 'EVIDENCE', 'Customer problems, research delivery and acquisition execution.', 'GATE', 'Similar demand can be delivered repeatedly.'],
    ['ROLE', 'Test the complete transaction through an owned business.', 'EVIDENCE', 'CaseSage product, inquiry, QC and fulfilment operations.', 'GATE', 'A one-off lesson becomes a stable operating method.'],
    ['ROLE', 'Package stable methods into products customers can use.', 'EVIDENCE', 'Research, content, buyer and inquiry workflows.', 'GATE', 'Customers can use the system and obtain repeatable outcomes.'],
    ['ROLE', 'Turn operating relationships into network compounding.', 'EVIDENCE', 'Customers, suppliers, operators and delivery partners.', 'GATE', 'The density of real collaboration is high enough.']
  ] : [
    ['本层职责', '用服务获取现金流与一手需求。', '当前证据', '客户问题、研究交付与获客执行。', '进入下一层的门槛', '相似需求可重复交付。'],
    ['本层职责', '用自营业务验证完整交易。', '当前证据', 'CaseSage 的产品、询盘、QC 与交付。', '进入下一层的门槛', '单点经验形成稳定方法。'],
    ['本层职责', '把稳定方法封装为客户可使用的产品。', '当前证据', '研究、内容、客户与询盘工作流。', '进入下一层的门槛', '客户能够自主使用并获得结果。'],
    ['本层职责', '让真实交易关系形成网络复利。', '当前证据', '客户、供应链、操盘者与伙伴。', '进入下一层的门槛', '真实协作密度足够高。']
  ];
  const architectureTrack = document.querySelector('.architecture-track');
  const architectureItems = [...document.querySelectorAll('.arch-unit')];
  let architectureDetail;
  if (architectureTrack && architectureItems.length) {
    architectureDetail = document.createElement('div');
    architectureDetail.className = 'architecture-detail';
    architectureDetail.id = 'architecture-detail';
    architectureDetail.setAttribute('aria-live', 'polite');
    architectureTrack.after(architectureDetail);
    const updateArchitecture = (item, index) => {
      const data = architectureCopy[index];
      setActive(architectureItems, item);
      architectureDetail.innerHTML = data.map((copy, part) => part % 2 === 0
        ? `<div><b>${copy}</b><p>${data[part + 1]}</p></div>` : '').join('');
      architectureDetail.classList.remove('detail-updated');
      requestAnimationFrame(() => architectureDetail.classList.add('detail-updated'));
    };
    architectureItems.forEach((item, index) => {
      item.type = 'button';
      item.setAttribute('aria-controls', architectureDetail.id);
      item.addEventListener('click', () => updateArchitecture(item, index));
      item.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex = (index + step + architectureItems.length) % architectureItems.length;
        architectureItems[nextIndex].focus();
        updateArchitecture(architectureItems[nextIndex], nextIndex);
      });
    });
    updateArchitecture(architectureItems[0], 0);
  }

  // Progressive reveal: hierarchy first, motion second.
  const revealItems = [...document.querySelectorAll([
    '.section h2', '.split-intro > p', '.capability-list article', '.product-card',
    '.map-node', '.case-grid', '.stage', '.charter-cards article', '.contact-routes > *'
  ].join(','))];
  if (!reduceMotion && 'IntersectionObserver' in window) {
    revealItems.forEach((item, index) => {
      item.classList.add('reveal-item');
      item.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 70}ms`);
    });
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  // Post-hero motion system: scroll-linked depth plus direct, low-amplitude surface response.
  const motionSections = [...document.querySelectorAll('.section')];
  const stageSection = document.querySelector('.stage-section');
  const hoverMotion = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!reduceMotion && motionSections.length) {
    motionSections.forEach((section, index) => {
      section.classList.add('motion-section');
      const ambient = document.createElement('span');
      ambient.className = 'section-ambient';
      ambient.setAttribute('aria-hidden', 'true');
      ambient.dataset.motionIndex = String(index + 1).padStart(2, '0');
      section.prepend(ambient);
    });

    if ('IntersectionObserver' in window) {
      const motionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('motion-visible', entry.isIntersecting));
      }, { rootMargin: '12% 0px 12% 0px', threshold: 0.02 });
      motionSections.forEach((section) => motionObserver.observe(section));
    } else {
      motionSections.forEach((section) => section.classList.add('motion-visible'));
    }

    let sectionMotionFrame = 0;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const updateSectionMotion = () => {
      const viewportHeight = innerHeight || 1;
      const compact = innerWidth < 700;
      motionSections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.bottom < -120 || rect.top > viewportHeight + 120) return;
        const centerOffset = (rect.top + rect.height / 2 - viewportHeight / 2) / viewportHeight;
        const position = clamp(-centerOffset, -1, 1);
        section.style.setProperty('--ambient-drift', `${(position * (compact ? 9 : 19)).toFixed(2)}px`);
        section.style.setProperty('--heading-drift', `${(position * (compact ? 2.5 : 5.5)).toFixed(2)}px`);
        section.style.setProperty('--label-drift', `${(position * (compact ? -1.5 : -3.5)).toFixed(2)}px`);
        section.style.setProperty('--case-drift', `${(position * (compact ? 5 : 11)).toFixed(2)}px`);
      });
      if (stageSection) {
        const rect = stageSection.getBoundingClientRect();
        const progressValue = clamp((viewportHeight - rect.top) / (rect.height + viewportHeight * 0.45), 0, 1);
        stageSection.style.setProperty('--method-progress', `${(progressValue * 100).toFixed(2)}%`);
      }
      sectionMotionFrame = 0;
    };
    const queueSectionMotion = () => {
      if (!sectionMotionFrame) sectionMotionFrame = requestAnimationFrame(updateSectionMotion);
    };
    updateSectionMotion();
    addEventListener('scroll', queueSectionMotion, { passive: true });
    addEventListener('resize', queueSectionMotion, { passive: true });
  }

  if (!reduceMotion && hoverMotion) {
    const clampFloat = (value, min, max) => Math.min(max, Math.max(min, value));
    const floatSurfaces = [...document.querySelectorAll([
      '.evidence-lines article', '.product-card[data-product]', '.arch-unit', '.map-node',
      '.case-image', '.case-evidence article', '.stage', '.charter-cards article', '.contact-routes > *'
    ].join(','))];
    floatSurfaces.forEach((surface) => {
      surface.classList.add('float-surface');
      let floatFrame = 0;
      let nextX = 0;
      let nextY = 0;
      const paintFloat = () => {
        surface.style.setProperty('--float-x', `${nextX.toFixed(2)}px`);
        surface.style.setProperty('--float-y', `${nextY.toFixed(2)}px`);
        floatFrame = 0;
      };
      surface.addEventListener('pointerenter', () => surface.classList.add('is-tracking'));
      surface.addEventListener('pointermove', ({ clientX, clientY }) => {
        const rect = surface.getBoundingClientRect();
        nextX = clampFloat((clientX - rect.left) / Math.max(1, rect.width) - 0.5, -0.5, 0.5) * 5;
        nextY = clampFloat((clientY - rect.top) / Math.max(1, rect.height) - 0.5, -0.5, 0.5) * 3 - 2;
        if (!floatFrame) floatFrame = requestAnimationFrame(paintFloat);
      }, { passive: true });
      surface.addEventListener('pointerleave', () => {
        if (floatFrame) cancelAnimationFrame(floatFrame);
        floatFrame = 0;
        nextX = 0;
        nextY = 0;
        surface.classList.remove('is-tracking');
        surface.style.setProperty('--float-x', '0px');
        surface.style.setProperty('--float-y', '0px');
      });
    });
  }

  // A projected 3D supply-demand field: spatial, lightweight and subordinate to the message.
  const hero = document.querySelector('.hero');
  const canvas = document.querySelector('.hero-canvas');
  if (hero && canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    const nodes = [];
    const nodeCount = innerWidth < 640 ? 44 : 82;
    for (let i = 0; i < nodeCount; i += 1) {
      const y = 1 - (i / Math.max(1, nodeCount - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      nodes.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, seed: i / nodeCount });
    }
    const connections = [[2, 25], [7, 59], [13, 40], [21, 68], [31, 78], [4, 51]]
      .filter((pair) => pair[1] < nodeCount);
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;
    let visible = true;
    let rotation = 0.45;
    let targetRotation = rotation;
    let tilt = -0.12;
    let targetTilt = tilt;
    const dpr = Math.min(1.5, devicePixelRatio || 1);

    const resizeCanvas = () => {
      const rect = hero.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const rotatePoint = (point, ry = rotation, rx = tilt) => {
      const cy = Math.cos(ry); const sy = Math.sin(ry);
      const x1 = point.x * cy - point.z * sy;
      const z1 = point.x * sy + point.z * cy;
      const cx = Math.cos(rx); const sx = Math.sin(rx);
      return { x: x1, y: point.y * cx - z1 * sx, z: point.y * sx + z1 * cx };
    };
    const project = (point) => {
      const radius = Math.min(width, height) * (innerWidth < 760 ? 0.28 : 0.36);
      const centerX = innerWidth < 760 ? width * 0.74 : width * 0.77;
      const centerY = innerWidth < 760 ? height * 0.35 : height * 0.52;
      const perspective = 1 + point.z * 0.14;
      return { x: centerX + point.x * radius * perspective, y: centerY + point.y * radius * perspective, z: point.z, radius };
    };
    const spherePoint = (latitude, longitude) => ({
      x: Math.cos(latitude) * Math.cos(longitude),
      y: Math.sin(latitude),
      z: Math.cos(latitude) * Math.sin(longitude)
    });
    const drawCurve = (points, color, lineWidth = 0.65, dash = []) => {
      ctx.beginPath();
      points.forEach((point, index) => {
        const p = project(rotatePoint(point));
        if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const render = (time = 0) => {
      ctx.clearRect(0, 0, width, height);
      rotation += (targetRotation - rotation) * 0.035;
      tilt += (targetTilt - tilt) * 0.035;
      if (!reduceMotion) rotation += 0.00017;

      for (let lat = -60; lat <= 60; lat += 30) {
        const points = [];
        for (let lon = 0; lon <= 360; lon += 8) points.push(spherePoint(lat * Math.PI / 180, lon * Math.PI / 180));
        drawCurve(points, 'rgba(24,163,163,.14)', 0.65);
      }
      for (let lon = 0; lon < 180; lon += 30) {
        const points = [];
        for (let lat = -90; lat <= 90; lat += 6) points.push(spherePoint(lat * Math.PI / 180, lon * Math.PI / 180));
        drawCurve(points, 'rgba(24,163,163,.11)', 0.65);
      }

      connections.forEach(([from, to], connectionIndex) => {
        const a = nodes[from]; const b = nodes[to]; const points = [];
        for (let step = 0; step <= 30; step += 1) {
          const t = step / 30;
          let x = a.x * (1 - t) + b.x * t;
          let y = a.y * (1 - t) + b.y * t;
          let z = a.z * (1 - t) + b.z * t;
          const length = Math.sqrt(x * x + y * y + z * z) || 1;
          const lift = 1 + Math.sin(Math.PI * t) * 0.22;
          points.push({ x: x / length * lift, y: y / length * lift, z: z / length * lift });
        }
        drawCurve(points, connectionIndex % 2 ? 'rgba(239,102,50,.4)' : 'rgba(24,163,163,.36)', 1, [2, 5]);
      });

      const projectedNodes = nodes.map((node) => ({ ...project(rotatePoint(node)), seed: node.seed }));
      projectedNodes.sort((a, b) => a.z - b.z).forEach((node) => {
        const alpha = 0.18 + (node.z + 1) * 0.2;
        const pulse = reduceMotion ? 1 : 0.82 + Math.sin(time * 0.0017 + node.seed * 18) * 0.18;
        ctx.beginPath();
        ctx.arc(node.x, node.y, (node.z > 0 ? 1.7 : 1) * pulse, 0, Math.PI * 2);
        ctx.fillStyle = node.seed > 0.82 ? `rgba(239,102,50,${alpha + 0.18})` : `rgba(24,163,163,${alpha})`;
        ctx.fill();
      });
      if (running && visible && !reduceMotion) frame = requestAnimationFrame(render);
    };
    const startCanvas = () => {
      if (reduceMotion) { render(0); return; }
      if (!frame && running && visible) frame = requestAnimationFrame(render);
    };
    const stopCanvas = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
    resizeCanvas();
    document.body.classList.add('has-canvas');
    render(0);
    startCanvas();
    hero.addEventListener('pointermove', ({ clientX, clientY }) => {
      if (reduceMotion) return;
      const rect = hero.getBoundingClientRect();
      targetRotation = 0.45 + ((clientX - rect.left) / rect.width - 0.5) * 0.38;
      targetTilt = -0.12 + ((clientY - rect.top) / rect.height - 0.5) * 0.2;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { targetRotation = 0.45; targetTilt = -0.12; });
    addEventListener('resize', () => { stopCanvas(); resizeCanvas(); render(0); }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) startCanvas(); else stopCanvas();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) startCanvas(); else stopCanvas();
      }, { threshold: 0.01 }).observe(hero);
    }
  }

  document.querySelectorAll('[data-track]').forEach((element) => {
    element.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('qianx:interaction', {
        detail: { event: element.dataset.track, path: location.pathname }
      }));
    });
  });
})();
