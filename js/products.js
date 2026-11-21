/* ==========================================================================
   TRIPPERS COFFEE — products.js
   Menu product management (images, recipes, availability) + categories.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  function catName(id) {
    var c = Store.category(id);
    return c ? c.name : "Uncategorised";
  }

  function productImage(p) {
    return Store.image(p.id) || U.placeholderImage(p.name);
  }

  /* ================================================================
     PRODUCTS
     ================================================================ */
  var pstate = {
    search: "",
    category: "all",
    availability: "all",
    bound: false,
    pendingImage: null,
    removeImage: false
  };

  function productFiltered() {
    var q = pstate.search.trim().toLowerCase();
    return Store.db.products.filter(function (p) {
      if (pstate.category !== "all" && p.categoryId !== pstate.category) return false;
      if (pstate.availability === "pos" && !(p.active && p.available)) return false;
      if (pstate.availability === "hidden" && p.available) return false;
      if (pstate.availability === "disabled" && p.active) return false;
      if (q) {
        var hay = (p.name + " " + p.description + " " + catName(p.categoryId)).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function renderPills() {
    var wrap = document.getElementById("prdCategoryPills");
    var cats = Store.db.categories;
    var html = '<button class="pill ' + (pstate.category === "all" ? "active" : "") + '" data-pcat="all">All</button>';
    html += cats.map(function (c) {
      return '<button class="pill ' + (pstate.category === c.id ? "active" : "") + '" data-pcat="' + c.id + '">' +
        U.esc(c.name) + "</button>";
    }).join("");
    wrap.innerHTML = html;
  }

  function renderGrid() {
    var grid = document.getElementById("productGrid");
    var empty = document.getElementById("productEmpty");
    var list = productFiltered();

    if (!list.length) {
      grid.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    grid.innerHTML = list.map(function (p) {
      var img = productImage(p);
      var off = !p.active;
      var posVisible = p.active && p.available;
      var statusBadges = "";
      if (!p.active) statusBadges += '<span class="badge-soft badge-muted">Disabled</span>';
      else if (!p.available) statusBadges += '<span class="badge-soft badge-low">Unavailable</span>';
      else statusBadges += '<span class="badge-soft badge-in">Available</span>';

      var recipeCount = (p.recipe || []).length;
      return '<article class="product-card ' + (off ? "is-off" : "") + '" data-product="' + p.id + '">' +
        '<div class="product-media">' +
        '<img src="' + U.esc(img) + '" alt="' + U.attr(p.name) + '" loading="lazy">' +
        '<div class="media-tags">' + statusBadges +
        (recipeCount ? "" : '<span class="badge-soft badge-muted" title="No recipe linked"><i class="bi bi-exclamation-circle"></i> No recipe</span>') +
        "</div></div>" +
        '<div class="product-body">' +
        '<h6 class="product-name">' + U.esc(p.name) + "</h6>" +
        '<div class="product-cat">' + U.esc(catName(p.categoryId)) + "</div>" +
        '<p class="product-desc">' + U.esc(p.description || "No description yet.") + "</p>" +
        "</div>" +
        '<div class="product-foot">' +
        '<span class="product-price">' + U.money(p.price) + "</span>" +
        '<div class="actions">' +
        '<button class="btn-icon" data-pedit="' + p.id + '" title="Edit product"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn-icon" data-ptoggle="' + p.id + '" title="' +
        (p.active ? "Disable product" : "Enable product") + '"><i class="bi ' +
        (p.active ? "bi-toggle-on" : "bi-toggle-off") + '"></i></button>' +
        '<button class="btn-icon danger" data-pdel="' + p.id + '" title="Delete product"><i class="bi bi-trash3"></i></button>' +
        "</div></div></article>";
    }).join("");
  }

  /* --------------------------------------------------------- form */
  function addRecipeRow(inventoryId, qty) {
    var box = document.getElementById("recipeRows");
    var row = document.createElement("div");
    row.className = "recipe-row";
    row.innerHTML =
      '<select class="form-select r-item">' +
      '<option value="">Choose ingredient…</option>' +
      Store.db.inventory.map(function (i) {
        return '<option value="' + i.id + '">' + U.esc(i.name) + " (" + U.esc(i.unit) + ")</option>";
      }).join("") +
      "</select>" +
      '<input type="number" class="form-control r-qty" min="0.001" step="0.001" placeholder="Qty">' +
      '<span class="r-unit">unit</span>' +
      '<button type="button" class="btn-icon danger" data-remove-recipe title="Remove"><i class="bi bi-x-lg"></i></button>';

    box.appendChild(row);
    var select = row.querySelector(".r-item");
    if (inventoryId && Store.inventoryItem(inventoryId)) select.value = inventoryId;
    row.querySelector(".r-qty").value = qty ? qty : "";
    syncRecipeUnit(row);
    select.addEventListener("change", function () { syncRecipeUnit(row); });
    row.querySelector("[data-remove-recipe]").addEventListener("click", function () { row.remove(); });
  }

  function syncRecipeUnit(row) {
    var id = row.querySelector(".r-item").value;
    var item = Store.inventoryItem(id);
    row.querySelector(".r-unit").textContent = item ? item.unit : "unit";
  }

  function readRecipe() {
    var rows = Array.prototype.slice.call(document.querySelectorAll("#recipeRows .recipe-row"));
    var map = {};
    var bad = null;

    rows.forEach(function (row) {
      var id = row.querySelector(".r-item").value;
      var qty = parseFloat(row.querySelector(".r-qty").value);
      if (!id) return;
      if (!isFinite(qty) || qty <= 0) { bad = "Every recipe ingredient needs a quantity greater than zero."; return; }
      if (!Store.inventoryItem(id)) { bad = "One of the recipe ingredients no longer exists."; return; }
      map[id] = (map[id] || 0) + qty;
    });

    var recipe = Object.keys(map).map(function (id) {
      return { inventoryId: id, qty: U.r2(map[id]) };
    });
    return { recipe: recipe, error: bad };
  }

  function updatePreview() {
    var name = document.getElementById("prdName").value.trim() || "Product name";
    var price = parseFloat(document.getElementById("prdPrice").value) || 0;
    var cat = document.getElementById("prdCategory").value;
    document.getElementById("prdPreviewName").textContent = name;
    document.getElementById("prdPreviewCat").textContent = catName(cat) || "Category";
    document.getElementById("prdPreviewPrice").textContent = U.money(price);
    document.getElementById("prdPreviewImg").src =
      pstate.pendingImage || (document.getElementById("prdImagePreview").dataset.existing || U.placeholderImage(name));
  }

  function openForm(product) {
    if (!window.Auth.requireAdmin()) return;
    var err = document.getElementById("prdFormError");
    err.classList.add("hidden");
    pstate.pendingImage = null;
    pstate.removeImage = false;

    var isEdit = !!product;
    document.getElementById("prdModalTitle").textContent = isEdit ? "Edit product" : "New product";
    document.getElementById("prdId").value = isEdit ? product.id : "";

    var catSelect = document.getElementById("prdCategory");
    catSelect.innerHTML = Store.db.categories.map(function (c) {
      return '<option value="' + c.id + '">' + U.esc(c.name) + "</option>";
    }).join("");

    document.getElementById("prdName").value = isEdit ? product.name : "";
    document.getElementById("prdPrice").value = isEdit ? product.price : "";
    document.getElementById("prdDesc").value = isEdit ? (product.description || "") : "";
    document.getElementById("prdActive").checked = isEdit ? !!product.active : true;
    document.getElementById("prdAvailable").checked = isEdit ? !!product.available : true;
    if (isEdit && product.categoryId) catSelect.value = product.categoryId;

    var currentImg = isEdit ? Store.image(product.id) : null;
    document.getElementById("prdImagePreview").src = currentImg || U.placeholderImage(isEdit ? product.name : "New product");
    document.getElementById("prdImagePreview").dataset.existing = currentImg || "";
    document.getElementById("prdImageInput").value = "";

    var box = document.getElementById("recipeRows");
    box.innerHTML = "";
    if (isEdit && product.recipe && product.recipe.length) {
      product.recipe.forEach(function (r) { addRecipeRow(r.inventoryId, r.qty); });
    }

    updatePreview();
    window.App.modal("productModal").show();
  }

  function saveProduct(e) {
    e.preventDefault();
    if (!window.Auth.requireAdmin()) return;

    var err = document.getElementById("prdFormError");
    err.classList.add("hidden");
    function fail(msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
      err.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    var id = document.getElementById("prdId").value;
    var name = document.getElementById("prdName").value.trim();
    var categoryId = document.getElementById("prdCategory").value;
    var price = parseFloat(document.getElementById("prdPrice").value);
    var description = document.getElementById("prdDesc").value.trim();
    var active = document.getElementById("prdActive").checked;
    var available = document.getElementById("prdAvailable").checked;

    if (!name) return fail("Product name is required.");
    if (!categoryId || !Store.category(categoryId)) return fail("Choose a valid category.");
    if (!isFinite(price) || price < 0) return fail("Enter a valid selling price.");
    var dup = Store.db.products.filter(function (p) {
      return p.name.toLowerCase() === name.toLowerCase() && p.id !== id;
    })[0];
    if (dup) return fail("Another product already uses that name.");

    var rec = readRecipe();
    if (rec.error) return fail(rec.error);

    /* Snapshot first: if the image write fails we can undo the product change. */
    var snapshot = JSON.stringify(Store.db);
    var savedId = id;
    if (id) {
      var p = Store.product(id);
      if (!p) return fail("That product no longer exists.");
      p.name = name;
      p.categoryId = categoryId;
      p.price = U.r2(price);
      p.description = description;
      p.active = active;
      p.available = available;
      p.recipe = rec.recipe;
      p.updatedAt = new Date().toISOString();
      Store.notify("product", "Product updated", name + " was updated in the menu.");
    } else {
      var newProduct = {
        id: Store.nextId("PRD", "product", 3),
        name: name,
        categoryId: categoryId,
        price: U.r2(price),
        description: description,
        recipe: rec.recipe,
        active: active,
        available: available,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      Store.db.products.push(newProduct);
      savedId = newProduct.id;
      Store.notify("product", "Product added", name + " was added to the menu.");
    }

    /* image handling */
    if (pstate.removeImage) {
      Store.removeImage(savedId);
    }
    if (pstate.pendingImage && !Store.setImage(savedId, pstate.pendingImage)) {
      // Storage is full — roll the database back to the pre-edit snapshot.
      Store.db = Store.normalize(JSON.parse(snapshot));
      return fail("Could not save that image — browser storage is full. Try a smaller image or remove other photos.");
    }

    Store.commit();
    window.App.modal("productModal").hide();
    renderPills();
    renderGrid();
    window.App.refreshShell();
    window.App.toast(id ? "Product updated." : "Product created.", "success");
    if (window.AdminPage) window.AdminPage.refreshIfVisible();
  }

  function toggleProduct(id) {
    if (!window.Auth.requireAdmin()) return;
    var p = Store.product(id);
    if (!p) return;
    p.active = !p.active;
    p.updatedAt = new Date().toISOString();
    Store.notify("product", p.active ? "Product enabled" : "Product disabled",
      p.name + " is now " + (p.active ? "enabled" : "disabled") + (p.active ? "." : " and hidden from the POS."));
    Store.commit();
    renderGrid();
    window.App.toast(p.name + (p.active ? " enabled." : " disabled."), "success");
  }

  function removeProduct(id) {
    if (!window.Auth.requireAdmin()) return;
    var p = Store.product(id);
    if (!p) return;
    window.App.confirm({
      title: "Delete product?",
      body: "<strong>" + U.esc(p.name) + "</strong> will be removed from the menu and the POS. " +
        "Historical sales keep their recorded names and prices.",
      okText: "Delete product",
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;
      Store.db.products = Store.db.products.filter(function (x) { return x.id !== id; });
      Store.removeImage(id);
      Store.commit();
      renderGrid();
      window.App.refreshShell();
      window.App.toast("Product deleted.", "success");
      if (window.AdminPage) window.AdminPage.refreshIfVisible();
    });
  }

  var ProductsPage = {
    render: function () {
      renderPills();
      document.getElementById("prdSearch").value = pstate.search;
      document.getElementById("prdAvailability").value = pstate.availability;
      renderGrid();
      if (!pstate.bound) this.bind();
    },

    bind: function () {
      pstate.bound = true;

      document.getElementById("prdSearch").addEventListener("input", U.debounce(function (e) {
        pstate.search = e.target.value;
        renderGrid();
      }, 170));

      document.getElementById("prdAvailability").addEventListener("change", function (e) {
        pstate.availability = e.target.value;
        renderGrid();
      });

      document.getElementById("prdCategoryPills").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-pcat]");
        if (!btn) return;
        pstate.category = btn.getAttribute("data-pcat");
        renderPills();
        renderGrid();
      });

      document.getElementById("btnAddProduct").addEventListener("click", function () {
        if (!Store.db.categories.length) {
          window.App.toast("Create a category before adding products.", "warning");
          window.App.go("#/admin/categories");
          return;
        }
        openForm(null);
      });

      document.getElementById("productGrid").addEventListener("click", function (e) {
        var edit = e.target.closest("[data-pedit]");
        var toggle = e.target.closest("[data-ptoggle]");
        var del = e.target.closest("[data-pdel]");
        if (edit) {
          var p = Store.product(edit.getAttribute("data-pedit"));
          if (p) openForm(p);
        } else if (toggle) {
          toggleProduct(toggle.getAttribute("data-ptoggle"));
        } else if (del) {
          removeProduct(del.getAttribute("data-pdel"));
        }
      });

      document.getElementById("addRecipeRow").addEventListener("click", function () {
        if (!Store.db.inventory.length) {
          window.App.toast("Add inventory items first to build a recipe.", "warning");
          return;
        }
        addRecipeRow(null, null);
      });

      document.getElementById("productForm").addEventListener("submit", saveProduct);

      /* live preview */
      ["prdName", "prdPrice"].forEach(function (id) {
        document.getElementById(id).addEventListener("input", updatePreview);
      });
      document.getElementById("prdCategory").addEventListener("change", updatePreview);

      /* image upload */
      var drop = document.getElementById("prdImageDrop");
      var input = document.getElementById("prdImageInput");
      drop.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) return;
        U.readImage(file, 720, 0.72).then(function (dataUrl) {
          pstate.pendingImage = dataUrl;
          pstate.removeImage = false;
          document.getElementById("prdImagePreview").src = dataUrl;
          updatePreview();
        }).catch(function (err) {
          window.App.toast(err.message, "danger");
        });
      });

      document.getElementById("prdImageRemove").addEventListener("click", function () {
        pstate.pendingImage = null;
        pstate.removeImage = true;
        var name = document.getElementById("prdName").value.trim() || "Product";
        document.getElementById("prdImagePreview").src = U.placeholderImage(name);
        document.getElementById("prdImagePreview").dataset.existing = "";
        updatePreview();
      });
    },

    /** Public: used by the admin dashboard quick actions. */
    openForm: function (product) {
      if (!window.Auth.requireAdmin()) return;
      openForm(product || null);
    }
  };

  /* ================================================================
     CATEGORIES
     ================================================================ */
  var cstate = { search: "", bound: false };

  function catFiltered() {
    var q = cstate.search.trim().toLowerCase();
    return Store.db.categories.filter(function (c) {
      if (!q) return true;
      return (c.name + " " + (c.description || "")).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function renderCategories() {
    var body = document.getElementById("categoryBody");
    var list = catFiltered();

    if (!list.length) {
      body.innerHTML = '<tr><td colspan="5"><div class="empty-state"><i class="bi bi-tags"></i><p>No categories match your search.</p></div></td></tr>';
    } else {
      body.innerHTML = list.map(function (c) {
        var count = Store.productsInCategory(c.id).length;
        return "<tr>" +
          '<td><div class="cell-title">' + U.esc(c.name) + '</div><div class="cell-sub mono">' + U.esc(c.id) + "</div></td>" +
          '<td class="cell-sub">' + U.esc(c.description || "—") + "</td>" +
          '<td><span class="badge-soft ' + (count ? "badge-gold" : "badge-muted") + '">' + count + " product" + (count === 1 ? "" : "s") + "</span></td>" +
          '<td class="cell-sub">' + U.fmtDate(c.createdAt) + "</td>" +
          '<td><div class="table-actions">' +
          '<button class="btn-icon" data-cat-view="' + c.id + '" title="View products"><i class="bi bi-eye"></i></button>' +
          '<button class="btn-icon" data-cat-edit="' + c.id + '" title="Edit"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn-icon danger" data-cat-del="' + c.id + '" title="Delete"><i class="bi bi-trash3"></i></button>' +
          "</div></td></tr>";
      }).join("");
    }

    document.getElementById("catCountLabel").textContent =
      Store.db.categories.length + " categories · " + Store.db.products.length + " products";
    renderPills();
  }

  function openCategoryForm(cat) {
    if (!window.Auth.requireAdmin()) return;
    var err = document.getElementById("catFormError");
    err.classList.add("hidden");
    document.getElementById("catModalTitle").textContent = cat ? "Edit category" : "New category";
    document.getElementById("catId").value = cat ? cat.id : "";
    document.getElementById("catName").value = cat ? cat.name : "";
    document.getElementById("catDesc").value = cat ? (cat.description || "") : "";
    window.App.modal("categoryModal").show();
  }

  function saveCategory(e) {
    e.preventDefault();
    if (!window.Auth.requireAdmin()) return;
    var err = document.getElementById("catFormError");
    var id = document.getElementById("catId").value;
    var name = document.getElementById("catName").value.trim();
    var desc = document.getElementById("catDesc").value.trim();

    function fail(msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
    }
    if (!name) return fail("Category name is required.");
    var dup = Store.db.categories.filter(function (c) {
      return c.name.toLowerCase() === name.toLowerCase() && c.id !== id;
    })[0];
    if (dup) return fail("That category already exists.");

    if (id) {
      var c = Store.category(id);
      if (!c) return fail("That category no longer exists.");
      c.name = name;
      c.description = desc;
      Store.commit();
      window.App.toast("Category updated.", "success");
    } else {
      Store.db.categories.push({
        id: Store.nextId("CAT", "category", 3),
        name: name,
        description: desc,
        createdAt: new Date().toISOString()
      });
      Store.commit();
      window.App.toast("Category created.", "success");
    }

    window.App.modal("categoryModal").hide();
    renderCategories();
  }

  function removeCategory(id) {
    if (!window.Auth.requireAdmin()) return;
    var c = Store.category(id);
    if (!c) return;
    var products = Store.productsInCategory(id);
    if (products.length) {
      window.App.toast(
        "Cannot delete “" + c.name + "” — " + products.length + " product" +
        (products.length > 1 ? "s are" : " is") + " still assigned (" +
        products.slice(0, 3).map(function (p) { return p.name; }).join(", ") +
        (products.length > 3 ? "…" : "") + "). Reassign them first.",
        "danger", 6500
      );
      return;
    }
    window.App.confirm({
      title: "Delete category?",
      body: "“" + U.esc(c.name) + "” will be removed. No products are assigned to it.",
      okText: "Delete category",
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;
      Store.db.categories = Store.db.categories.filter(function (x) { return x.id !== id; });
      Store.commit();
      renderCategories();
      window.App.toast("Category deleted.", "success");
    });
  }

  function viewCategoryProducts(id) {
    var c = Store.category(id);
    if (!c) return;
    var products = Store.productsInCategory(id);
    document.getElementById("catProductsTitle").textContent = c.name + " — products";
    var body = document.getElementById("catProductsBody");
    if (!products.length) {
      body.innerHTML = '<div class="empty-state"><i class="bi bi-cup-hot"></i><p>No products in this category yet.</p></div>';
    } else {
      body.innerHTML = '<div class="table-wrap"><table class="table table-premium">' +
        "<thead><tr><th>Product</th><th>Price</th><th>Status</th></tr></thead><tbody>" +
        products.map(function (p) {
          return "<tr><td><div class=\"d-flex align-items-center gap-2\">" +
            '<img class="thumb-xs" src="' + U.esc(productImage(p)) + '" alt="">' +
            '<span class="cell-title">' + U.esc(p.name) + "</span></div></td>" +
            '<td class="mono">' + U.money(p.price) + "</td>" +
            "<td>" + (p.active && p.available
              ? '<span class="badge-soft badge-in">Available</span>'
              : '<span class="badge-soft badge-muted">Hidden</span>') + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    window.App.modal("categoryProductsModal").show();
  }

  var CategoriesPage = {
    render: function () {
      document.getElementById("catSearch").value = cstate.search;
      renderCategories();
      if (!cstate.bound) this.bind();
    },

    bind: function () {
      cstate.bound = true;

      document.getElementById("catSearch").addEventListener("input", U.debounce(function (e) {
        cstate.search = e.target.value;
        renderCategories();
      }, 170));

      document.getElementById("btnAddCategory").addEventListener("click", function () { openCategoryForm(null); });
      document.getElementById("categoryForm").addEventListener("submit", saveCategory);

      document.getElementById("categoryBody").addEventListener("click", function (e) {
        var view = e.target.closest("[data-cat-view]");
        var edit = e.target.closest("[data-cat-edit]");
        var del = e.target.closest("[data-cat-del]");
        if (view) viewCategoryProducts(view.getAttribute("data-cat-view"));
        else if (edit) {
          var c = Store.category(edit.getAttribute("data-cat-edit"));
          if (c) openCategoryForm(c);
        } else if (del) removeCategory(del.getAttribute("data-cat-del"));
      });
    },

    openForm: function (category) {
      if (!window.Auth.requireAdmin()) return;
      openCategoryForm(category || null);
    }
  };

  window.ProductsPage = ProductsPage;
  window.CategoriesPage = CategoriesPage;
})(window);
