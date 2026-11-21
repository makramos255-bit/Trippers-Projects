/* ==========================================================================
   TRIPPERS COFFEE — receipt.js
   One receipt builder shared by the POS, Sales management and printing.
   ========================================================================== */
(function (window) {
  "use strict";

  var Receipt = {
    /** Returns the complete receipt markup for a sale record. */
    build: function (sale) {
      if (!sale) return "";
      var S = window.Store.db.settings;
      var U = window.Utils;
      var width = String(S.receiptWidth) === "58" ? " w58" : "";
      // Uploaded raster logos are used as-is; anything else falls back to the
      // built-in bean mark so old seeded SVGs don't linger in receipts.
      var customLogo = S.logo && !/^data:image\/svg\+xml/i.test(S.logo);
      var logo = '<img class="r-logo" src="' + U.esc(customLogo ? S.logo : U.logoImage()) + '" alt="">';

      var items = (sale.items || []).map(function (it) {
        return '<tr>' +
          '<td class="it-name">' + U.esc(it.name) +
          '<div class="it-sub">' + U.qty(it.qty) + " × " + U.money(it.price) + "</div></td>" +
          '<td class="num">' + U.qty(it.qty) + "</td>" +
          '<td class="num">' + U.money(it.lineTotal || it.price * it.qty) + "</td>" +
          "</tr>";
      }).join("");

      var discountRow = sale.discountAmount > 0
        ? '<div class="r-row"><span class="lbl">Discount' +
          (sale.discountType === "percent" ? " (" + U.qty(sale.discountValue) + "%)" : "") +
          '</span><span>− ' + U.money(sale.discountAmount) + "</span></div>"
        : "";

      var paymentRows = '<div class="r-row"><span class="lbl">Payment</span><span>' + U.esc(sale.paymentMethod) + "</span></div>";
      if (sale.paymentMethod === "Cash") {
        paymentRows += '<div class="r-row"><span class="lbl">Cash</span><span>' + U.money(sale.cashReceived) + "</span></div>" +
          '<div class="r-row"><span class="lbl">Change</span><span>' + U.money(sale.change) + "</span></div>";
      } else if (sale.reference) {
        paymentRows += '<div class="r-row"><span class="lbl">Reference</span><span>' + U.esc(sale.reference) + "</span></div>";
      }

      var voidBanner = sale.status === "voided"
        ? '<div class="r-void">Voided</div>'
        : "";

      var footer = String(S.receiptFooter || "").replace(/\n/g, "<br>");

      return '<div class="receipt-paper' + width + '">' +
        '<div class="r-center">' +
        logo +
        '<div class="r-shop">' + U.esc(S.shopName) + "</div>" +
        '<div class="r-tag">Specialty Coffee</div>' +
        '<div class="r-addr">' + U.esc(S.address) + "<br>" + U.esc(S.contact) + "</div>" +
        "</div>" +
        '<div class="r-sep"></div>' +
        '<div class="r-meta">' +
        "<span>Receipt<br><strong>" + U.esc(sale.id) + "</strong></span>" +
        "<span>" + U.fmtDate(sale.datetime) + "<br>" + U.fmtTime(sale.datetime) + "</span>" +
        "</div>" +
        '<div class="r-meta"><span>Cashier</span><span>' + U.esc(sale.cashierName || "—") + "</span></div>" +
        voidBanner +
        '<div class="r-sep"></div>' +
        '<table class="r-items">' +
        '<thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>' +
        "<tbody>" + items + "</tbody></table>" +
        '<div class="r-sep"></div>' +
        '<div class="r-sum">' +
        '<div class="r-row"><span class="lbl">Subtotal</span><span>' + U.money(sale.subtotal) + "</span></div>" +
        discountRow +
        '<div class="r-row"><span class="lbl">VAT (' + U.qty(sale.taxRate) + "%)</span><span>" + U.money(sale.taxAmount) + "</span></div>" +
        '<div class="r-row grand"><span>TOTAL</span><span>' + U.money(sale.total) + "</span></div>" +
        paymentRows +
        "</div>" +
        '<div class="r-sep"></div>' +
        (footer ? '<div class="r-foot">' + footer + "</div>" : "") +
        '<div class="r-thanks">Thank you · Come again</div>' +
        '<div class="r-code">' + U.esc(sale.id) + "</div>" +
        "</div>";
    },

    /** Renders a receipt into the hidden print area and triggers the dialog. */
    print: function (sale) {
      var area = document.getElementById("receiptPrintArea");
      if (!area || !sale) return;
      area.innerHTML = this.build(sale);
      var cleanup = function () {
        window.removeEventListener("afterprint", cleanup);
        setTimeout(function () { area.innerHTML = ""; }, 200);
      };
      window.addEventListener("afterprint", cleanup);
      // Give the browser a frame to lay the receipt out before printing.
      setTimeout(function () {
        window.print();
        // Fallback for browsers that never fire afterprint.
        setTimeout(cleanup, 1500);
      }, 60);
    },

    /** Opens the receipt modal with the given sale. */
    show: function (sale, opts) {
      opts = opts || {};
      var stage = document.getElementById("receiptStage");
      if (!stage) return;
      stage.innerHTML = this.build(sale);
      var title = document.getElementById("receiptModalTitle");
      if (title) {
        title.innerHTML = opts.title ||
          '<i class="bi bi-check-circle text-gold me-2"></i>Transaction complete';
      }
      var msg = document.getElementById("receiptSuccessMsg");
      if (msg) msg.classList.toggle("hidden", opts.hideSuccess === true);
      var btn = document.getElementById("receiptPrintBtn");
      if (btn) btn.dataset.saleId = sale.id;
      if (window.App) window.App.modal("receiptModal").show();
    }
  };

  window.Receipt = Receipt;
})(window);
