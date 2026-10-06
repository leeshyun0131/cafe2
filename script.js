/* =============================================
   바이브 카페 주문서 스크립트
   script.js — 탭 + 주문 내역 + Supabase 저장 기능 포함
   ============================================= */


/* =============================================
   0. Supabase 설정
   - SUPABASE_URL : Supabase 프로젝트 설정 > API > Project URL
   - SUPABASE_KEY : Supabase 프로젝트 설정 > API > anon(public) key
   - supabaseClient : DB와 통신할 때 사용하는 클라이언트 객체
   ============================================= */
const SUPABASE_URL = 'https://xgxzkzbtxzkfpytgrsjy.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneHpremJ0eHprZnB5dGdyc2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMzcwMzEsImV4cCI6MjEwNjgxMzAzMX0.AP97Rlf_1-kv4H8QMmPeKjQrscmO5VEOq1NZS32tCBc';   // ← 여기에 본인 anon key 붙여넣기

// supabase.createClient: CDN으로 불러온 supabase-js 라이브러리의 함수
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


/* =============================================
   1. 요소 참조 (id로 DOM 요소 가져오기)
   ============================================= */

// 주문서 폼 관련
const form          = document.getElementById('order-form');
const nameInput     = document.getElementById('customer-name');
const phoneInput    = document.getElementById('phone');          // 전화번호
const drinkSelect   = document.getElementById('drink');
const quantityInput = document.getElementById('quantity');
const requestInput  = document.getElementById('request');        // 요청사항 textarea
const priceValue    = document.getElementById('price-value');
const orderConfirm  = document.getElementById('order-confirm');
const btnSubmit     = document.getElementById('btn-submit');     // 주문하기 버튼

// 탭 메뉴 버튼
const tabBtnOrder   = document.getElementById('tab-btn-order');
const tabBtnHistory = document.getElementById('tab-btn-history');

// 탭 패널 (콘텐츠 영역)
const tabOrder      = document.getElementById('tab-order');
const tabHistory    = document.getElementById('tab-history');

// 배지 (주문 건수 표시 동그라미)
const orderBadge    = document.getElementById('order-badge');

// 주문 내역 탭 안의 요소들
const orderList     = document.getElementById('order-list');    // 카드 목록 컨테이너
const orderSummary  = document.getElementById('order-summary'); // 하단 요약 영역
const summaryText   = document.getElementById('summary-text'); // "총 주문 금액: ..." 텍스트
const btnClearAll   = document.getElementById('btn-clear-all'); // 내역 모두 지우기 버튼


/* =============================================
   2. 이름 매핑 테이블
   - 드롭다운·체크박스의 value(영문) → 화면에 보여줄 한글 이름
   ============================================= */
const drinkNames = {
  'americano':           '아메리카노',
  'caffe-latte':         '카페라떼',
  'caffe-mocha':         '카페모카',
  'strawberry-smoothie': '딸기스무디',
  'green-tea-latte':     '녹차라떼',
};

const extraNames = {
  'shot':  '샷 추가',
  'cream': '크림 추가',
  'syrup': '시럽 추가',
  'decaf': '디카페인',
};


/* =============================================
   3. 주문 데이터 저장소
   - orders  : 주문 객체를 담는 배열
   - orderCounter : 주문 번호 카운터
     (삭제해도 번호가 줄어들지 않도록 전역 변수로 관리)
   ============================================= */
let orders       = [];
let orderCounter = 0;


/* =============================================
   4. calculateTotal() — 예상 금액 계산
   - 음료 + 사이즈 + 추가옵션 합산 × 수량
   - 여러 곳에서 재사용하므로 별도 함수로 분리
   ============================================= */
function calculateTotal() {

  // ① 음료 가격: 현재 선택된 <option>의 data-price 읽기
  const selectedOption = drinkSelect.selectedOptions[0];
  const drinkPrice = parseInt(selectedOption.dataset.price, 10);

  // ② 사이즈 추가 금액: 체크된 라디오의 data-price 읽기
  const checkedSize = document.querySelector('input[name="size"]:checked');
  const sizePrice   = checkedSize ? parseInt(checkedSize.dataset.price, 10) : 0;

  // ③ 추가 옵션 합계: 체크된 체크박스를 모두 순회
  let extrasPrice = 0;
  document.querySelectorAll('input[name="extras"]:checked').forEach(function (cb) {
    extrasPrice += parseInt(cb.dataset.price, 10);
  });

  // ④ 수량 (최소 1 보정)
  const quantity = Math.max(1, parseInt(quantityInput.value, 10) || 1);

  // ⑤ 최종 금액
  return (drinkPrice + sizePrice + extrasPrice) * quantity;
}


/* =============================================
   5. updatePriceDisplay() — 예상 금액 화면 표시
   ============================================= */
function updatePriceDisplay() {
  // toLocaleString(): 5000 → "5,000" (천 단위 콤마 자동 적용)
  priceValue.textContent = calculateTotal().toLocaleString() + '원';
}


/* =============================================
   6. switchTab() — 탭 전환 함수
   @param {string} tabName  'order' | 'history'
   ============================================= */
function switchTab(tabName) {
  if (tabName === 'order') {
    // 주문하기 탭 활성화
    tabBtnOrder.classList.add('active');
    tabBtnHistory.classList.remove('active');
    tabOrder.hidden   = false;
    tabHistory.hidden = true;
  } else {
    // 주문 내역 탭 활성화
    tabBtnHistory.classList.add('active');
    tabBtnOrder.classList.remove('active');
    tabHistory.hidden = false;
    tabOrder.hidden   = true;
  }
}


/* =============================================
   7. renderOrders() — 주문 내역 목록 다시 그리기
   - 이 함수 하나로 목록 전체를 다시 그림
   - 카드 생성, 빈 안내, 요약, 배지 업데이트까지 담당
   ============================================= */
function renderOrders() {

  // 기존 목록 초기화 (이전에 그린 카드들 모두 제거)
  orderList.innerHTML = '';

  /* ── 주문이 없을 때 ── */
  if (orders.length === 0) {
    const empty = document.createElement('p');
    empty.className   = 'order-empty';
    empty.textContent = '아직 주문 내역이 없어요 ☕';
    orderList.appendChild(empty);
    orderSummary.hidden = true;  // 요약 숨김
    return; // 아래 코드 실행 안 함
  }

  /* ── 주문이 있을 때: 최신 주문이 맨 위 오도록 역순 순회 ── */
  // [...orders].reverse(): 원본 배열은 건드리지 않고 복사본을 역순으로
  ;[...orders].reverse().forEach(function (order) {

    /* ---- 카드 컨테이너 ---- */
    const card = document.createElement('div');
    card.className = 'order-card';

    /* ---- 카드 헤더: "#1 홍길동님 · 5,000원"  +  취소 버튼 ---- */
    const cardHeader = document.createElement('div');
    cardHeader.className = 'order-card-header';

    const cardTitle = document.createElement('span');
    cardTitle.className = 'order-card-title';
    // ※ 사용자가 입력한 이름이 포함되므로 XSS 방지를 위해 textContent 사용
    cardTitle.textContent =
      '#' + order.id + '  ' + order.name + '님  ·  ' +
      order.total.toLocaleString() + '원';

    // 취소 버튼: data-order-id로 어떤 주문인지 식별
    const cancelBtn       = document.createElement('button');
    cancelBtn.type        = 'button';
    cancelBtn.className   = 'btn-cancel';
    cancelBtn.textContent = '취소';
    cancelBtn.dataset.orderId = order.id; // 이벤트 위임에서 사용

    cardHeader.appendChild(cardTitle);
    cardHeader.appendChild(cancelBtn);

    /* ---- 카드 본문: "카페라떼 M사이즈 (샷 추가) 1잔" ---- */
    const cardBody    = document.createElement('p');
    cardBody.className = 'order-card-body';

    // 추가 옵션이 있으면 "(샷 추가, 크림 추가)" 형식으로, 없으면 빈 문자열
    const extrasText = order.extras.length > 0
      ? ' (' + order.extras.join(', ') + ')'
      : '';
    cardBody.textContent =
      order.drinkName + ' ' + order.size + '사이즈' +
      extrasText + '  ' + order.quantity + '잔';

    /* ---- 카드 푸터: 요청사항(있을 때만) · 주문 시간 ---- */
    const cardFooter    = document.createElement('p');
    cardFooter.className = 'order-card-footer';

    // 요청사항이 있으면 앞에 추가
    let footerText = '';
    if (order.request) {
      footerText += '📝 ' + order.request + '  ·  ';
    }
    footerText += '🕐 ' + order.time;
    cardFooter.textContent = footerText;

    /* ---- 카드 조립 후 목록에 추가 ---- */
    card.appendChild(cardHeader);
    card.appendChild(cardBody);
    card.appendChild(cardFooter);
    orderList.appendChild(card);
  });

  /* ── 하단 요약 업데이트 ── */
  // reduce: 배열의 모든 주문 금액을 합산
  const totalAmount = orders.reduce(function (sum, o) { return sum + o.total; }, 0);
  summaryText.textContent =
    '총 주문 금액: ' + totalAmount.toLocaleString() + '원 (' + orders.length + '건)';
  orderSummary.hidden = false;

  /* ── 배지 업데이트 ── */
  orderBadge.textContent = orders.length;
  orderBadge.hidden      = false;
}


/* =============================================
   8. 실시간 금액 계산 이벤트 리스너
   ============================================= */

// 음료 드롭다운
drinkSelect.addEventListener('change', updatePriceDisplay);

// 사이즈 라디오 버튼 전체
document.querySelectorAll('input[name="size"]').forEach(function (radio) {
  radio.addEventListener('change', updatePriceDisplay);
});

// 추가 옵션 체크박스 전체
document.querySelectorAll('input[name="extras"]').forEach(function (checkbox) {
  checkbox.addEventListener('change', updatePriceDisplay);
});

// 수량 (input: 키 입력마다 즉시 반응)
quantityInput.addEventListener('input', updatePriceDisplay);


/* =============================================
   9. 탭 버튼 이벤트
   ============================================= */
tabBtnOrder.addEventListener('click', function () {
  switchTab('order');
});

tabBtnHistory.addEventListener('click', function () {
  switchTab('history');
  renderOrders(); // 탭을 열 때마다 최신 목록 갱신
});


/* =============================================
   10. 주문하기 버튼 — submit 이벤트 (Supabase 저장 포함)
   - async function: 안에서 await(비동기 대기)를 사용하기 위해 필요
   ============================================= */
form.addEventListener('submit', async function (event) {

  // 폼의 기본 동작(페이지 새로고침)을 막음
  event.preventDefault();

  /* ── 유효성 검사 ── */
  const name = nameInput.value.trim(); // trim(): 앞뒤 공백 제거
  if (name === '') {
    alert('이름을 입력해주세요.');
    nameInput.focus();
    return;
  }
  if (drinkSelect.value === '') {
    alert('음료를 선택해주세요.');
    drinkSelect.focus();
    return;
  }

  /* ── 주문 데이터 수집 ── */
  const phone     = phoneInput ? phoneInput.value.trim() : '';
  const drinkName = drinkNames[drinkSelect.value];

  // 음료 단가: 선택된 <option>의 data-price 읽기
  const drinkPrice = parseInt(drinkSelect.selectedOptions[0].dataset.price, 10);

  const sizeValue = document.querySelector('input[name="size"]:checked').value;

  // 선택된 추가 옵션 이름 목록 배열로 수집
  const selectedExtras = [];
  document.querySelectorAll('input[name="extras"]:checked').forEach(function (cb) {
    selectedExtras.push(extraNames[cb.value]);
  });

  const quantity    = Math.max(1, parseInt(quantityInput.value, 10) || 1);
  const total       = calculateTotal();
  const requestText = requestInput ? requestInput.value.trim() : '';

  // 주문 시간: "오전 09:05" 형식
  const now     = new Date();
  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  /* ── 버튼 비활성화 (저장 중 두 번 눌림 방지) ── */
  btnSubmit.disabled    = true;
  btnSubmit.textContent = '저장 중...';

  /* ── Supabase에 주문 저장 ── */
  // try: 정상 실행 시도
  // catch: 오류가 발생하면 여기서 처리
  // finally: 성공·실패 상관없이 항상 실행 (버튼 복구용)
  try {

    // supabaseClient.from('테이블명').insert({저장할 데이터})
    // await: 저장이 완료될 때까지 기다린 후 결과를 받음
    const { error } = await supabaseClient
      .from('cafe_menu03')        // 저장할 테이블 이름
      .insert({
        customer_name : name,            // 손님 이름
        phone         : phone || null,   // 전화번호 (없으면 null)
        drink         : drinkSelect.value, // 음료 value (예: caffe-latte)
        drink_price   : drinkPrice,      // 음료 단가
        size          : sizeValue,       // 사이즈 (S / M / L)
        options       : selectedExtras,  // 추가 옵션 배열
        quantity      : quantity,        // 수량
        request       : requestText || null, // 요청사항 (없으면 null)
        total_price   : total,           // 최종 금액
      });

    // error가 있으면 강제로 catch 블록으로 넘김
    if (error) throw error;

    /* ── 저장 성공 시: 로컬 배열 업데이트 + 확인 메시지 표시 ── */
    orderCounter++;

    orders.push({
      id:        orderCounter,
      name:      name,
      drinkName: drinkName,
      size:      sizeValue,
      extras:    selectedExtras,
      quantity:  quantity,
      request:   requestText,
      total:     total,
      time:      timeStr,
    });

    // 주문 확인 메시지 조립
    const extrasText = selectedExtras.length > 0
      ? ' (' + selectedExtras.join(', ') + ')'
      : '';
    const message =
      name + '님, ' +
      drinkName + ' ' + sizeValue + '사이즈' +
      extrasText + ' ' + quantity + '잔, 총 ' +
      total.toLocaleString() + '원 주문이 접수되었습니다! ☕';

    // textContent: XSS 방지를 위해 innerHTML 대신 사용
    orderConfirm.textContent = message;
    orderConfirm.hidden      = false;
    orderConfirm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 배지 즉시 업데이트
    orderBadge.textContent = orders.length;
    orderBadge.hidden      = false;

  } catch (err) {

    /* ── 저장 실패 시: 상세 원인 알림 + 콘솔 에러 출력 ── */
    const errorMsg = err.message || err.error_description || JSON.stringify(err);
    alert('⚠️ 주문 저장 실패!\n\n원인: ' + errorMsg + '\n\n(자세한 내용은 F12 개발자 도구 콘솔을 확인해주세요)');
    // console.error: 개발자 도구 콘솔에 상세 오류 내용 출력
    console.error('Supabase 저장 상세 오류:', err);

  } finally {

    /* ── 성공·실패 모두: 버튼 원래 상태로 복구 ── */
    // finally는 try/catch 결과에 상관없이 반드시 실행됨
    btnSubmit.disabled    = false;
    btnSubmit.textContent = '주문하기';

  }
});




/* =============================================
   11. 다시 작성 버튼 — reset 이벤트
   - 주문서만 초기화, 주문 내역(orders 배열)은 유지
   ============================================= */
form.addEventListener('reset', function () {
  // setTimeout 0ms: 브라우저가 폼 값 초기화를 완료한 직후 실행되도록 미룸
  setTimeout(function () {
    priceValue.textContent   = '0원';    // 금액 초기화
    orderConfirm.hidden      = true;     // 확인 메시지 숨김
    orderConfirm.textContent = '';       // 내용 비우기
    updatePriceDisplay();                // M 사이즈 기본값 반영해 금액 재계산
  }, 0);
});


/* =============================================
   12. 취소 버튼 — 이벤트 위임
   - 카드마다 리스너를 붙이면 카드를 새로 그릴 때마다 재등록해야 해서 비효율적
   - 대신 부모 요소(orderList)에 딱 한 번만 리스너를 등록하고,
     클릭된 요소가 취소 버튼인지 확인해서 처리
   ============================================= */
orderList.addEventListener('click', function (event) {

  // 클릭된 요소가 취소 버튼이 아니면 무시
  if (!event.target.classList.contains('btn-cancel')) return;

  const orderId = parseInt(event.target.dataset.orderId, 10);

  // confirm: 브라우저 기본 확인 창 (한 번 더 물어보기)
  const confirmed = confirm('주문 #' + orderId + '을(를) 취소할까요?');
  if (!confirmed) return;

  // filter: orderId와 다른 주문만 남기고 삭제 효과
  orders = orders.filter(function (o) { return o.id !== orderId; });

  // 목록 다시 그리기 (배지도 내부에서 업데이트)
  renderOrders();

  // 주문이 하나도 없으면 배지 숨김
  if (orders.length === 0) {
    orderBadge.hidden = true;
  }
});


/* =============================================
   13. 내역 모두 지우기 버튼
   ============================================= */
btnClearAll.addEventListener('click', function () {
  const confirmed = confirm('주문 내역을 모두 지울까요?');
  if (!confirmed) return;

  orders = []; // 배열 비우기
  // orderCounter는 초기화 안 함 → 번호 재사용 방지
  renderOrders();

  // 배지 숨김
  orderBadge.hidden = true;
});


/* =============================================
   14. 페이지 로드 시 초기 실행
   ============================================= */
// M 사이즈 기본 선택 상태 반영
updatePriceDisplay();
// 빈 주문 내역 초기 세팅 (안내 문구 표시)
renderOrders();
