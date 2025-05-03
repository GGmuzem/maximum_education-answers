// content.js
(() => {
  console.log('AutoAnswer: content.js запущен');

  // ======= 1) Парсинг subjectId и testId из URL =========
  function parseIdsFromUrl() {
    const parts = window.location.pathname.split('/');
    const subjIdx = parts.indexOf('subjects');
    const testIdx = parts.indexOf('tests');
    if (subjIdx < 0 || testIdx < 0) return {};
    return {
      subjectId: parts[subjIdx + 1],
      testId: parts[testIdx + 1]
    };
  }

  let { subjectId, testId } = parseIdsFromUrl();
  if (!subjectId || !testId) {
    console.error('AutoAnswer: не удалось найти subjectId/testId в URL');
    return;
  }

  // ======= 2) Собираем API-URL =========
  function makeApiUrl(subjectId, testId) {
    return `https://education.maximumtest.ru/api/v1/content/practice/curriculumsubject/${subjectId}/tests/${testId}`;
  }

  let apiUrl = makeApiUrl(subjectId, testId);

  // ======= 3) Функция запроса и обработки ответа =========
  async function fetchAndInsertAnswer() {
    try {
      const res = await fetch(apiUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const rights = data.studentTestResult?.educationTest?.educationTestRightAnswers ||
                     data.educationTestRightAnswers;
      if (!Array.isArray(rights) || rights.length === 0) {
        console.warn('AutoAnswer: нет правильных ответов в JSON');
        return;
      }
      console.log('AutoAnswer: правильный ответ →');
 
      for (const right of rights) {
        const answer = right.variants[0];
        console.log('AutoAnswer:', answer);
        insertAnswer(answer);

      }
    } catch (err) {
      console.error('AutoAnswer: ошибка при fetch JSON', err);
    }
  }

  // ======= 4) Функция вставки ответа =========
  function insertAnswer(answer) {
    // 1) Ищем само поле
    const inputSelectors = [
      'div.single-text__answer-input textarea',  // любой textarea внутри нужного контейнера
      'textarea[data-test-id="textAreaInput"]',
      'textarea.mx-input__textarea',
      'textarea#input-1'
    ];
    let inputEl = null, usedSel = '';
    for (const sel of inputSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        inputEl = el;
        usedSel = sel;
        break;
      }
    }
    if (!inputEl) {
      return;
    }
    console.log('AutoAnswer: нашли поле по селектору', usedSel);
  
    // 2) Вставляем ответ
    inputEl.removeAttribute('disabled');
    inputEl.value = answer;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
    console.log('AutoAnswer: вставили ответ:', answer);
  
    // 3) Пытаемся отправить: сначала через форму
    const form = inputEl.closest('form');
    if (form) {
      console.log('AutoAnswer: нашли форму, вызываем form.submit()');
      form.submit();
      return;
    }
  
    // 4) Если формы нет, ищем кнопку "Ответить"
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      /отправить|ответить/i.test(b.innerText)
    );
    if (btn) {
      console.log('AutoAnswer: нашли кнопку по тексту, кликаем:', btn.innerText);
      btn.click();
      return;
    }
  
    // 5) В крайнем случае, имитируем Enter в поле
    console.log('AutoAnswer: кнопка не найдена — имитируем нажатие Enter в поле');
    const evt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
    inputEl.dispatchEvent(evt);
  }

  // ======= 5) Отслеживаем смену задания =========
  // Определяем участок DOM, где меняются задания
  function waitForQuestionContainer(callback) {
    const sel = '.test-question-body';
    const el = document.querySelector(sel);
    if (el) {
      console.log(`AutoAnswer: нашли контейнер ${sel}`);
      return callback(el);
    }
    const timer = setInterval(() => {
      const el2 = document.querySelector(sel);
      if (el2) {
        clearInterval(timer);
        console.log(`AutoAnswer: спустя задержку нашли контейнер ${sel}`);
        callback(el2);
      }
    }, 300);
    // отменять таймаут по желанию через setTimeout(clearInterval, maxTime)
  }
  
  waitForQuestionContainer(questionContainer => {
    // сразу подставляем первый ответ
    fetchAndInsertAnswer();
  
    // и далее наблюдаем за изменениями внутри него
    const mo = new MutationObserver(muts => {
      for (const mu of muts) {
        if (mu.type === 'childList' && mu.addedNodes.length > 0) {
          // проверяем, может сменился testId
          const ids = parseIdsFromUrl();
          if (ids.testId !== testId) {
            testId = ids.testId;
            apiUrl = makeApiUrl(subjectId, testId);
            console.log('AutoAnswer: обнаружено новое testId =', testId);
          }
          // чуть подождать, чтобы поле отрендерилось
          setTimeout(fetchAndInsertAnswer, 100);
          break;
        }
      }
    });
  
    mo.observe(questionContainer, { childList: true, subtree: true });
  });

  mo.observe(questionContainer, { childList: true, subtree: true });

  // ======= 6) Отслеживаем навигацию внутри SPA (History API) ========
  // чтобы знать, если пользователь кликнул «Следующее задание» без полной перезагрузки
  const origPush = history.pushState;
  history.pushState = function(...args) {
    origPush.apply(this, args);
    // немного подождать и заново распарсить URL + JSON
    setTimeout(() => {
      const ids = parseIdsFromUrl();
      if (ids.testId && ids.testId !== testId) {
        testId = ids.testId;
        apiUrl = makeApiUrl(subjectId, testId);
        console.log('AutoAnswer: навигация → новое testId =', testId);
        fetchAndInsertAnswer();
      }
    }, 200);
  };

  window.addEventListener('popstate', () => {
    setTimeout(() => {
      const ids = parseIdsFromUrl();
      if (ids.testId && ids.testId !== testId) {
        testId = ids.testId;
        apiUrl = makeApiUrl(subjectId, testId);
        console.log('AutoAnswer: back/forward → новое testId =', testId);
        fetchAndInsertAnswer();
      }
    }, 200);
  });

  console.log('AutoAnswer: наблюдатели установлены');
})();
