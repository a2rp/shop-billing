/* Shop Billing Lite - Vanilla JS */

(function () {
    const STORAGE_KEY = "sblite_state_v1";

    /** ---------- Utilities ---------- **/
    const padNumber = (n, size = 4) => String(n).padStart(size, "0");
    const nowIso = () => new Date().toISOString();
    const formatMoney = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
    const parseNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    };

    function clampDiscount(maxBase, type, value) {
        const base = Math.max(0, maxBase);
        if (type === "percent") {
            const pct = Math.max(0, Math.min(100, parseNum(value)));
            return base * (pct / 100);
        }
        return Math.min(base, parseNum(value)); // amount
    }

    function computeLine(price, qty, discType, discValue) {
        const lineBase = Math.max(0, parseNum(price) * parseNum(qty));
        const lineDiscount = clampDiscount(lineBase, discType, discValue);
        const lineTotal = Math.max(0, lineBase - lineDiscount);
        return { lineBase, lineDiscount, lineTotal };
    }

    // Custom date/time: "Sep 20, 2025 11:34:21 hrs"
    const MONTHS_SHORT = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    const two = (x) => String(x).padStart(2, "0");
    function formatDateTimeCustom(d) {
        const m = MONTHS_SHORT[d.getMonth()];
        const day = d.getDate();
        const yr = d.getFullYear();
        const hh = two(d.getHours());
        const mm = two(d.getMinutes());
        const ss = two(d.getSeconds());
        return `${m} ${day}, ${yr} ${hh}:${mm}:${ss} hrs`;
    }

    /** ---------- DOM ---------- **/
    const els = {
        storeNameText: document.getElementById("storeNameText"),
        storeAddressText: document.getElementById("storeAddressText"),
        storePhoneText: document.getElementById("storePhoneText"),
        billNumberBadge: document.getElementById("billNumberBadge"),
        billDateTime: document.getElementById("billDateTime"),
        billSeriesText: document.getElementById("billSeriesText"),

        itemsTbody: document.getElementById("itemsTbody"),
        itemsTable: document.getElementById("itemsTable"),
        btnAddRow: document.getElementById("btnAddRow"),

        billDiscType: document.getElementById("billDiscType"),
        billDiscValue: document.getElementById("billDiscValue"),

        subTotalText: document.getElementById("subTotalText"),
        billDiscountAmountText: document.getElementById(
            "billDiscountAmountText"
        ),
        grandTotalText: document.getElementById("grandTotalText"),

        noteInput: document.getElementById("noteInput"),

        historyPanel: document.getElementById("historyPanel"),
        historySearch: document.getElementById("historySearch"),
        historyList: document.getElementById("historyList"),

        btnNewBill: document.getElementById("btnNewBill"),
        btnSaveBill: document.getElementById("btnSaveBill"),
        btnPrint: document.getElementById("btnPrint"),
        // btnToggleHistory removed
        btnClearDraft: document.getElementById("btnClearDraft"),
        btnSettings: document.getElementById("btnSettings"),

        settingsDialog: document.getElementById("settingsDialog"),
        setStoreName: document.getElementById("setStoreName"),
        setStoreAddress: document.getElementById("setStoreAddress"),
        setStorePhone: document.getElementById("setStorePhone"),
        setBillSeries: document.getElementById("setBillSeries"),
        setNextNumber: document.getElementById("setNextNumber"),
        btnSaveSettings: document.getElementById("btnSaveSettings"),

        printArea: document.getElementById("printArea"),
        currentYear: document.getElementById("currentYear"),
    };

    if (els.currentYear) {
        els.currentYear.textContent = new Date().getFullYear();
    }

    /** ---------- State ---------- **/
    let state = loadState() || withDefaults(null);
    let autosaveTimer = null;
    let clockTimer = null;

    function withDefaults(current) {
        const defaults = {
            settings: {
                storeName: "Your Store",
                address: "Address line",
                phone: "Phone",
                billSeries: "SB",
                nextNumber: 1,
            },
            draft: {
                items: [],
                billDiscType: "percent",
                billDiscValue: 0,
                note: "",
                createdAt: nowIso(),
            },
            bills: [],
        };
        if (!current) return defaults;
        return {
            settings: { ...defaults.settings, ...(current.settings || {}) },
            draft: {
                ...defaults.draft,
                ...(current.draft || {}),
                items: (current.draft?.items || []).map(normalizeItem),
            },
            bills: Array.isArray(current.bills) ? current.bills : [],
        };
    }

    function normalizeItem(it) {
        return {
            name: it?.name || "",
            price: Math.max(0, parseNum(it?.price)),
            qty: Math.max(0, parseNum(it?.qty) || 1),
            discType: it?.discType === "amount" ? "amount" : "percent",
            discValue: Math.max(0, parseNum(it?.discValue)),
        };
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function autosaveSoon() {
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => saveState(), 300);
    }

    /** ---------- Render ---------- **/
    function renderAll() {
        renderMeta();
        renderItems();
        renderTotals();
        renderHistory(); // always visible
    }

    function renderMeta() {
        const { settings } = state;
        els.storeNameText.textContent = settings.storeName || "Your Store";
        els.storeAddressText.textContent = settings.address || "Address line";
        els.storePhoneText.textContent = settings.phone || "Phone";
        els.billSeriesText.textContent = settings.billSeries || "SB";
        startClock(); // live date/time
        els.billNumberBadge.textContent = "DRAFT";
    }

    function rowTemplate(item, idx) {
        return `
      <tr data-index="${idx}">
        <td><input type="text" class="cell name" value="${escapeHtml(
            item.name
        )}" placeholder="Item name" /></td>
        <td><input type="number" class="cell price" min="0" step="0.01" value="${
            item.price
        }"/></td>
        <td><input type="number" class="cell qty" min="0" step="1" value="${
            item.qty
        }"/></td>
        <td>
          <select class="cell discType">
            <option value="percent"${
                item.discType === "percent" ? " selected" : ""
            }>%</option>
            <option value="amount"${
                item.discType === "amount" ? " selected" : ""
            }>₹</option>
          </select>
        </td>
        <td><input type="number" class="cell discValue" min="0" step="0.01" value="${
            item.discValue
        }"/></td>
        <td class="lineTotal">₹0.00</td>
        <td><button class="remove-btn" title="Remove row">×</button></td>
      </tr>
    `;
    }

    function renderItems() {
        els.itemsTbody.innerHTML =
            state.draft.items.map(rowTemplate).join("") || "";
        if (state.draft.items.length === 0) addRow();
        updateLineTotalsInDOM();
        els.noteInput.value = state.draft.note || "";
        els.billDiscType.value = state.draft.billDiscType || "percent";
        els.billDiscValue.value = state.draft.billDiscValue || 0;
    }

    function updateLineTotalsInDOM() {
        const rows = els.itemsTbody.querySelectorAll("tr");
        rows.forEach((tr) => {
            const idx = Number(tr.dataset.index);
            const it = state.draft.items[idx];
            const out = computeLine(
                it.price,
                it.qty,
                it.discType,
                it.discValue
            );
            const cell = tr.querySelector(".lineTotal");
            if (cell) cell.textContent = formatMoney(out.lineTotal);
        });
    }

    function renderTotals() {
        const { subTotal, billDiscountAmount, grandTotal } = computeTotals();
        els.subTotalText.textContent = formatMoney(subTotal);
        els.billDiscountAmountText.textContent =
            formatMoney(billDiscountAmount);
        els.grandTotalText.textContent = formatMoney(grandTotal);
    }

    function renderHistory() {
        const q = (els.historySearch.value || "").trim().toLowerCase();
        const items = state.bills
            .slice()
            .reverse()
            .filter((b) => {
                if (!q) return true;
                const dateStr = formatDateTimeCustom(
                    new Date(b.createdAt)
                ).toLowerCase();
                return b.id.toLowerCase().includes(q) || dateStr.includes(q);
            });

        els.historyList.innerHTML = items
            .map((b) => {
                return `
        <li class="history-item" data-id="${b.id}">
          <div>
            <div><strong>${b.id}</strong> • ${
                    b.items.length
                } items • <strong>${formatMoney(b.grandTotal)}</strong></div>
            <div class="meta">${formatDateTimeCustom(
                new Date(b.createdAt)
            )}</div>
          </div>
          <div class="history-actions">
            <button data-act="open">Open</button>
            <button data-act="print">Print</button>
            <button class="danger" data-act="delete">Delete</button>
          </div>
        </li>
      `;
            })
            .join("");
    }

    /** ---------- Totals ---------- **/
    function computeTotals() {
        let subTotal = 0;
        state.draft.items.forEach((it) => {
            const { lineTotal } = computeLine(
                it.price,
                it.qty,
                it.discType,
                it.discValue
            );
            subTotal += lineTotal;
        });

        const billDiscountAmount = clampDiscount(
            subTotal,
            state.draft.billDiscType,
            state.draft.billDiscValue
        );
        const grandTotal = Math.max(0, subTotal - billDiscountAmount);

        return { subTotal, billDiscountAmount, grandTotal };
    }

    /** ---------- Mutations ---------- **/
    function addRow(prefill = {}) {
        state.draft.items.push(
            normalizeItem({
                name: prefill.name || "",
                price: prefill.price || 0,
                qty: prefill.qty || 1,
                discType: prefill.discType || "percent",
                discValue: prefill.discValue || 0,
            })
        );
        state.draft.createdAt ||= nowIso();
        autosaveSoon();
        renderItems();
        renderTotals();
        const last = els.itemsTbody.querySelector("tr:last-child .name");
        if (last) last.focus();
    }

    function removeRow(index) {
        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= state.draft.items.length
        )
            return;
        if (!confirm("Remove this item?")) return;
        state.draft.items.splice(index, 1);
        autosaveSoon();
        renderItems();
        renderTotals();
    }

    function updateRowFromDOM(tr) {
        const idx = Number(tr.dataset.index);
        const name = tr.querySelector(".name").value.trim();
        const price = parseNum(tr.querySelector(".price").value);
        const qty = Math.max(
            0,
            Math.floor(parseNum(tr.querySelector(".qty").value))
        );
        const discType =
            tr.querySelector(".discType").value === "amount"
                ? "amount"
                : "percent";
        const discValue = parseNum(tr.querySelector(".discValue").value);
        state.draft.items[idx] = normalizeItem({
            name,
            price,
            qty,
            discType,
            discValue,
        });
        autosaveSoon();
        updateLineTotalsInDOM();
        renderTotals();
    }

    function resetDraft(confirmAsk = true) {
        if (
            confirmAsk &&
            !confirm("Clear current draft? This cannot be undone.")
        )
            return;
        state.draft = {
            items: [],
            billDiscType: "percent",
            billDiscValue: 0,
            note: "",
            createdAt: nowIso(),
        };
        autosaveSoon();
        renderAll();
    }

    function saveBill() {
        const hasNamedItem = state.draft.items.some(
            (it) => it.name.trim().length > 0
        );
        if (!hasNamedItem)
            return alert("Add at least one item with a name before saving.");

        const { subTotal, billDiscountAmount, grandTotal } = computeTotals();

        const id = `${state.settings.billSeries || "SB"}-${padNumber(
            state.settings.nextNumber || 1
        )}`;
        const bill = {
            id,
            createdAt: nowIso(),
            items: state.draft.items.map(normalizeItem),
            subTotal,
            billDiscType: state.draft.billDiscType,
            billDiscValue: parseNum(state.draft.billDiscValue),
            billDiscAmount: billDiscountAmount,
            grandTotal,
            note: state.draft.note || "",
        };

        state.bills.push(bill);
        state.settings.nextNumber = (state.settings.nextNumber || 1) + 1;
        saveState();

        state.draft = {
            items: [],
            billDiscType: "percent",
            billDiscValue: 0,
            note: "",
            createdAt: nowIso(),
        };

        renderAll();
        alert(`Saved as ${bill.id}`);
    }

    /** ---------- Printing ---------- **/
    function fillPrintArea(billLike, store) {
        const isDraft = !billLike.id;
        const billId = isDraft ? "DRAFT" : billLike.id;
        const when = formatDateTimeCustom(
            new Date(billLike.createdAt || nowIso())
        );

        const rowsHtml = billLike.items
            .filter((it) => it.name && it.name.trim().length > 0)
            .map((it) => {
                const { lineTotal } = computeLine(
                    it.price,
                    it.qty,
                    it.discType,
                    it.discValue
                );
                const discLabel =
                    it.discType === "percent"
                        ? `${parseNum(it.discValue)}%`
                        : `₹${parseNum(it.discValue).toFixed(2)}`;
                return `
          <tr>
            <td>${escapeHtml(it.name)}</td>
            <td>${formatMoney(it.price)} × ${it.qty}</td>
            <td>${discLabel}</td>
            <td>${formatMoney(lineTotal)}</td>
          </tr>
        `;
            })
            .join("");

        const totals = isDraft
            ? (function () {
                  const { subTotal, billDiscountAmount, grandTotal } =
                      computeTotals();
                  return {
                      subTotal,
                      billDiscountAmount,
                      grandTotal,
                      billDiscType: state.draft.billDiscType,
                      billDiscValue: state.draft.billDiscValue,
                  };
              })()
            : {
                  subTotal: billLike.subTotal,
                  billDiscountAmount: billLike.billDiscAmount,
                  grandTotal: billLike.grandTotal,
                  billDiscType: billLike.billDiscType,
                  billDiscValue: billLike.billDiscValue,
              };

        const discLabel =
            totals.billDiscType === "percent"
                ? `${parseNum(totals.billDiscValue)}%`
                : `₹${parseNum(totals.billDiscValue).toFixed(2)}`;

        els.printArea.innerHTML = `
      <div class="print-slip">
        <div class="print-head">
          <h2>${escapeHtml(store.storeName)}</h2>
          <div class="print-sub">${escapeHtml(store.address || "")}${
            store.phone ? " • " + escapeHtml(store.phone) : ""
        }</div>
        </div>
        <div class="print-meta">
          <div><strong>Bill No:</strong> ${escapeHtml(billId)}</div>
          <div><strong>Date/Time:</strong> ${escapeHtml(when)}</div>
        </div>
        <table class="print-items">
          <thead>
            <tr>
              <th style="width:50%">Item</th>
              <th style="width:20%">Price × Qty</th>
              <th style="width:15%">Discount</th>
              <th style="width:15%">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="4">No items</td></tr>`}
          </tbody>
        </table>

        <div class="print-totals">
          <div class="row"><span>Sub-total</span><strong>${formatMoney(
              totals.subTotal
          )}</strong></div>
          <div class="row"><span>Bill Discount (${discLabel})</span><strong>${formatMoney(
            totals.billDiscountAmount
        )}</strong></div>
          <div class="row"><span><strong>Grand Total</strong></span><strong>${formatMoney(
              totals.grandTotal
          )}</strong></div>
        </div>

        ${
            billLike.note
                ? `<div class="print-footer"><em>Note:</em> ${escapeHtml(
                      billLike.note
                  )}</div>`
                : ""
        }
        <div class="print-footer">Thank you for your purchase!</div>
      </div>
    `;
    }

    function printCurrent() {
        fillPrintArea(
            {
                id: null,
                items: state.draft.items,
                note: state.draft.note,
                createdAt: state.draft.createdAt,
            },
            state.settings
        );
        window.print();
    }

    function printBillById(id) {
        const bill = state.bills.find((b) => b.id === id);
        if (!bill) return alert("Bill not found.");
        fillPrintArea(bill, state.settings);
        window.print();
    }

    /** ---------- History Actions ---------- **/
    function openBillById(id) {
        const bill = state.bills.find((b) => b.id === id);
        if (!bill) return alert("Bill not found.");
        state.draft = {
            items: bill.items.map(normalizeItem),
            billDiscType: bill.billDiscType,
            billDiscValue: bill.billDiscValue,
            note: bill.note || "",
            createdAt: nowIso(),
        };
        autosaveSoon();
        renderAll();
        alert(`Opened ${bill.id} as draft.`);
    }

    function deleteBillById(id) {
        if (!confirm(`Delete ${id}? This cannot be undone.`)) return;
        const idx = state.bills.findIndex((b) => b.id === id);
        if (idx >= 0) {
            state.bills.splice(idx, 1);
            saveState();
            renderHistory();
            alert(`Deleted ${id}.`);
        }
    }

    /** ---------- Settings ---------- **/
    function openSettings() {
        els.setStoreName.value = state.settings.storeName || "";
        els.setStoreAddress.value = state.settings.address || "";
        els.setStorePhone.value = state.settings.phone || "";
        els.setBillSeries.value = state.settings.billSeries || "SB";
        els.setNextNumber.value = state.settings.nextNumber || 1;
        els.settingsDialog.showModal();
    }

    function saveSettingsFromDialog() {
        state.settings.storeName =
            els.setStoreName.value.trim() || "Your Store";
        state.settings.address = els.setStoreAddress.value.trim();
        state.settings.phone = els.setStorePhone.value.trim();
        state.settings.billSeries = (
            els.setBillSeries.value.trim() || "SB"
        ).toUpperCase();
        state.settings.nextNumber = Math.max(
            1,
            Math.floor(parseNum(els.setNextNumber.value))
        );
        saveState();
        els.settingsDialog.close();
        renderMeta();
    }

    /** ---------- Event Wiring ---------- **/
    els.btnAddRow.addEventListener("click", () => addRow());

    els.itemsTbody.addEventListener("input", (e) => {
        const tr = e.target.closest("tr");
        if (tr) updateRowFromDOM(tr);
    });
    els.itemsTbody.addEventListener("change", (e) => {
        const tr = e.target.closest("tr");
        if (tr) updateRowFromDOM(tr);
    });
    els.itemsTbody.addEventListener("click", (e) => {
        if (e.target.closest(".remove-btn")) {
            const tr = e.target.closest("tr");
            if (!tr) return;
            const idx = Number(tr.dataset.index);
            removeRow(idx);
        }
    });

    els.billDiscType.addEventListener("change", () => {
        state.draft.billDiscType =
            els.billDiscType.value === "amount" ? "amount" : "percent";
        autosaveSoon();
        renderTotals();
    });
    els.billDiscValue.addEventListener("input", () => {
        state.draft.billDiscValue = parseNum(els.billDiscValue.value);
        autosaveSoon();
        renderTotals();
    });
    els.noteInput.addEventListener("input", () => {
        state.draft.note = els.noteInput.value.slice(0, 200);
        autosaveSoon();
    });

    els.btnNewBill.addEventListener("click", () => resetDraft(false));
    els.btnClearDraft.addEventListener("click", () => resetDraft(true));
    els.btnSaveBill.addEventListener("click", saveBill);
    els.btnPrint.addEventListener("click", printCurrent);

    // History list interactions
    els.historySearch.addEventListener("input", renderHistory);
    els.historyList.addEventListener("click", (e) => {
        const li = e.target.closest(".history-item");
        if (!li) return;
        const id = li.dataset.id;
        const act = e.target.dataset.act;
        if (act === "open") openBillById(id);
        if (act === "print") printBillById(id);
        if (act === "delete") deleteBillById(id);
    });

    // Settings
    els.btnSettings.addEventListener("click", openSettings);
    els.btnSaveSettings.addEventListener("click", (e) => {
        e.preventDefault();
        saveSettingsFromDialog();
    });

    // Keyboard shortcuts (Alt+H removed)
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            saveBill();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
            e.preventDefault();
            printCurrent();
        }
        if (e.altKey && e.key.toLowerCase() === "n") {
            e.preventDefault();
            resetDraft(false);
        }
    });

    /** ---------- Live Clock ---------- **/
    function updateClock() {
        els.billDateTime.textContent = formatDateTimeCustom(new Date());
    }
    function startClock() {
        updateClock();
        if (clockTimer) clearInterval(clockTimer);
        clockTimer = setInterval(updateClock, 1000);
    }

    /** ---------- Helpers ---------- **/
    function escapeHtml(str) {
        return (str || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    /** ---------- Boot ---------- **/
    renderAll();
    if (state.draft.items.length === 0) addRow();
    else autosaveSoon();
})();
