document.addEventListener('DOMContentLoaded', function () {
    // --- Element References ---
    const selectedCountSpan = document.getElementById('selectedCount');
    const searchQueryInput = document.getElementById('searchQuery');
    const dataTableBody = document.getElementById('dataTableBody'); // Ensure your <tbody> has this ID
    const selectedCountDropdownToggle = document.getElementById('selectedCountDropdownToggle');
    const selectedItemsDropdownMenu = document.getElementById('selectedItemsDropdownMenu');
    const unselectAllBtn = document.getElementById('unselectAllBtn');
    const showSelectedToggle = document.getElementById('showSelectedToggle');
    const overallGrandTotal = document.getElementById('overallGrandTotal');
    const tableContainer = document.querySelector('.table-responsive-container');

    // Check if the element exists and is focusable before attempting to focus it
    if (tableContainer && typeof tableContainer.focus === 'function') {
        tableContainer.focus(); // Give the container focus
    }    

    // --- Persistence for Checkboxes ---
    let persistedCheckedItems = new Set();
    const storageKey = 'checkedSheetItems';

    const storedItems = sessionStorage.getItem(storageKey);
    if (storedItems) {
        try {
            const parsedItems = JSON.parse(storedItems);
            if (Array.isArray(parsedItems)) {
                parsedItems.forEach(item => persistedCheckedItems.add(item));
            }
        } catch (e) {
            console.error("Error parsing stored checked items from sessionStorage:", e);
            sessionStorage.removeItem(storageKey); // Clear corrupted data
        }
    }

    let saveTimeout;
    function saveCheckedItemsDebounced() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            sessionStorage.setItem(storageKey, JSON.stringify(Array.from(persistedCheckedItems)));
        }, 300); // Save after 300ms of no changes
    }

    // --- Function to update the selected count display ---
    function updateSelectionCount() {
        selectedCountSpan.textContent = `${persistedCheckedItems.size} selected`;
        if (selectedCountDropdownToggle) {
            selectedCountDropdownToggle.style.display = 'inline-flex';
            void selectedCountDropdownToggle.offsetWidth;
        }
    }

    // NEW: Function to calculate and update the Grand Total
    function updateGrandTotal() {
        if (!overallGrandTotal) {
            console.warn("Grand Total cell with ID 'overallGrandTotal' not found. Grand total will not be calculated.");
            return;
        }

        let total = 0;
        // Select only visible total price cells within the dataTableBody
        document.querySelectorAll('#dataTableBody tr[style*="display: table-row"] .total-price-cell').forEach(cell => {
            const priceText = cell.textContent;
            const price = parseFloat(priceText.replace('$', ''));
            if (!isNaN(price)) {
                total += price;
            }
        });

        overallGrandTotal.textContent = '$' + total.toFixed(2);
        console.log("Grand Total updated to:", overallGrandTotal.textContent);
    }

    // --- Main Filtering Logic (for search AND "Show selected" toggle) ---
    let filterTimeout;
    function filterTable() {
        if (!dataTableBody) {
            console.warn("Table body with ID 'dataTableBody' not found. Filtering will not work.");
            return;
        }

        const rows = dataTableBody.getElementsByTagName('tr');
        const searchQuery = searchQueryInput ? searchQueryInput.value.toLowerCase() : '';
        const isShowSelectedActive = showSelectedToggle ? showSelectedToggle.checked : false;

        // Use a DocumentFragment for better performance if adding/removing many elements (though here we toggle display)
        // For display toggling, direct manipulation is fine, but good to keep in mind for large DOM changes.

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            let rowShouldBeVisible = false;

            let rowMatchesSearchCriteria = false;
            if (searchQuery !== '') {
                const cells = row.getElementsByTagName('td');
                const skuCell = cells[3];
                const titleCell = cells[4];

                if (skuCell && skuCell.textContent.toLowerCase().includes(searchQuery)) {
                    rowMatchesSearchCriteria = true;
                } else if (titleCell && titleCell.textContent.toLowerCase().includes(searchQuery)) {
                    rowMatchesSearchCriteria = true;
                }
            }

            const checkbox = row.querySelector('input[type="checkbox"][name="selectedItems"]');
            const itemIdentifier = checkbox ? checkbox.value : null;
            const isRowChecked = checkbox && itemIdentifier && persistedCheckedItems.has(itemIdentifier);

            if (isShowSelectedActive) {
                if (searchQuery === '') {
                    rowShouldBeVisible = isRowChecked;
                } else {
                    rowShouldBeVisible = isRowChecked || rowMatchesSearchCriteria;
                }
            } else {
                rowShouldBeVisible = (searchQuery === '' || rowMatchesSearchCriteria);
            }

            // Update checkbox state and apply/remove 'table-checked' class
            if (checkbox) {
                checkbox.checked = isRowChecked;
                if (checkbox.checked) {
                    row.classList.add('table-checked');
                } else {
                    row.classList.remove('table-checked');
                }
            }

            row.style.display = rowShouldBeVisible ? 'table-row' : 'none';
        }
        updateSelectionCount();
        updateGrandTotal(); // IMPORTANT: Call updateGrandTotal after filtering
    }

    // --- Dropdown Toggle Logic ---
    if (selectedCountDropdownToggle && selectedItemsDropdownMenu) {
        selectedCountDropdownToggle.addEventListener('click', function(event) {
            event.stopPropagation();
            selectedItemsDropdownMenu.classList.toggle('show');
        });

        document.addEventListener('click', function(event) {
            if (!selectedCountDropdownToggle.contains(event.target) && !selectedItemsDropdownMenu.contains(event.target)) {
                selectedItemsDropdownMenu.classList.remove('show');
            }
        });
    }

    // --- "Unselect All" Button Logic ---
    if (unselectAllBtn) {
        unselectAllBtn.addEventListener('click', function () {
            // STEP 1: Clear the internal state
            persistedCheckedItems.clear();

            // STEP 2: Perform DOM updates efficiently (batching where possible)
            // Get all checkboxes and associated quantity inputs ONCE
            const allCheckboxes = document.querySelectorAll('input[name="selectedItems"]');

            // Using requestAnimationFrame to ensure smooth DOM updates
            // (especially if the list is very long, though a single loop is usually fine)
            // Or, simply loop directly for immediate effect.
            // For a large number of rows, iterating through `allCheckboxes` is faster
            // than dispatching events that trigger more lookups.

            for (const checkbox of allCheckboxes) {
                checkbox.checked = false; // Uncheck the checkbox
                const row = checkbox.closest('tr');
                if (row) {
                    row.classList.remove('table-checked'); // Remove background color class

                    const quantityInput = row.querySelector('.quantity-input');
                    if (quantityInput) {
                        quantityInput.value = ''; // Clear the quantity input
                        // Directly update the total price for this row to empty
                        const totalPriceCell = row.querySelector('.total-price-cell');
                        if (totalPriceCell) {
                            totalPriceCell.textContent = '';
                        }
                    }
                }
            }
            
            // STEP 3: Update persisted storage (debounced)
            saveCheckedItemsDebounced();

            // STEP 4: Update UI elements that depend on the overall state (once)
            updateSelectionCount(); // Update the displayed count to 0
            selectedItemsDropdownMenu.classList.remove('show'); // Close the dropdown

            // STEP 5: Re-filter the table if 'Show selected' is active (this will call updateGrandTotal)
            if (showSelectedToggle) {
                showSelectedToggle.checked = false; // Set the toggle to OFF
                filterTable(); // This will re-evaluate row visibility and call updateGrandTotal() once.
            } else {
                // If the toggle doesn't exist, ensure grand total is updated
                updateGrandTotal();
            }
        });
    }

    // --- Re-check persisted checkboxes on page load (initial setup of checked state) ---
    document.querySelectorAll('input[name="selectedItems"]').forEach(checkbox => {
        if (persistedCheckedItems.has(checkbox.value)) {
            checkbox.checked = true;
            const row = checkbox.closest('tr');
            if (row) {
                row.classList.add('table-checked'); // Apply class on load if checked
            }
        }
    });

    // --- Event Delegation for Checkbox Changes (Primary handler) ---
    if (dataTableBody) {
        dataTableBody.addEventListener('change', function(event) {
            if (event.target.matches('input[type="checkbox"][name="selectedItems"]')) {
                const checkbox = event.target;
                const row = checkbox.closest('tr');
                const quantityInput = row ? row.querySelector('.quantity-input') : null;

                if (checkbox.checked) {
                    if (quantityInput) {
                        const currentValue = quantityInput.value.trim();
                        if (currentValue === '' || isNaN(Number(currentValue)) || Number(currentValue) <= 0) {
                            quantityInput.value = '1';
                            quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                    persistedCheckedItems.add(checkbox.value);
                    if (row) {
                        row.classList.add('table-checked');
                    }
                } else {
                    if (quantityInput) {
                        quantityInput.value = '';
                        quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    persistedCheckedItems.delete(checkbox.value);
                    if (row) {
                        row.classList.remove('table-checked');
                    }
                }
                saveCheckedItemsDebounced();
                updateSelectionCount();
                if (showSelectedToggle && showSelectedToggle.checked) {
                    filterTable();
                }
            }
        });

        // Event Delegation for Row Clicks to toggle checkbox OR increment quantity
        dataTableBody.addEventListener('click', function(event) {
            const clickedRow = event.target.closest('tr');

            if (event.target.closest('.product-link') || event.target.closest('.quantity-input') || event.target.matches('input[type="checkbox"][name="selectedItems"]')) {
                console.log("Row click on excluded element (product link, qty input, or checkbox itself). Not triggering row click toggle/increment.");
                return;
            }

            if (clickedRow) {
                const checkbox = clickedRow.querySelector('input[type="checkbox"][name="selectedItems"]');
                const quantityInput = clickedRow.querySelector('.quantity-input');

                if (checkbox && quantityInput) {
                    if (checkbox.checked) {
                        let currentQty = parseFloat(quantityInput.value);
                        if (isNaN(currentQty) || currentQty < 1) {
                            currentQty = 0;
                        }
                        quantityInput.value = currentQty + 1;
                        quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
                        console.log("Row clicked (checked item): Quantity incremented to", quantityInput.value);
                    } else {
                        console.log("Row clicked (unchecked item): Programmatically clicking checkbox.");
                        checkbox.click();
                    }
                } else {
                    console.warn("No checkbox or quantity input found in clicked row:", clickedRow);
                }
            } else {
                console.log("Click was not on a table row.");
            }
        });
    } else {
        // Fallback: This block should ideally not be hit if dataTableBody is correctly ID'd
        console.warn("Table body with ID 'dataTableBody' not found. Checkbox event delegation will not work. Attaching direct listeners.");
        document.querySelectorAll('input[name="selectedItems"]').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                console.log("Checkbox CHANGE event detected (fallback) for:", this);
                const row = this.closest('tr');
                const quantityInput = row ? row.querySelector('.quantity-input') : null;

                if (this.checked) {
                    if (quantityInput) {
                        const currentValue = quantityInput.value.trim();
                        if (currentValue === '' || isNaN(Number(currentValue)) || Number(currentValue) <= 0) {
                            quantityInput.value = '1';
                            quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                    persistedCheckedItems.add(this.value);
                    if (row) {
                        row.classList.add('table-checked');
                    }
                } else {
                    if (quantityInput) {
                        quantityInput.value = '';
                        quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    persistedCheckedItems.delete(this.value);
                    if (row) {
                        row.classList.remove('table-checked');
                    }
                }
                saveCheckedItemsDebounced();
                updateSelectionCount();
                if (showSelectedToggle && showSelectedToggle.checked) {
                    filterTable();
                }
            });

            const row = checkbox.closest('tr');
            if (row) {
                row.addEventListener('click', function(event) {
                    console.log("Row CLICK event detected (fallback). Target:", event.target);
                    if (!event.target.matches('input[type="checkbox"][name="selectedItems"]') &&
                        !event.target.closest('.product-link') &&
                        !event.target.closest('.quantity-input')) {

                        const checkbox = row.querySelector('input[type="checkbox"][name="selectedItems"]');
                        const quantityInput = row.querySelector('.quantity-input');

                        if (checkbox && quantityInput) {
                            if (checkbox.checked) {
                                let currentQty = parseFloat(quantityInput.value);
                                if (isNaN(currentQty) || currentQty < 1) {
                                    currentQty = 0;
                                }
                                quantityInput.value = currentQty + 1;
                                quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
                                console.log("Fallback row click (checked item): Quantity incremented to", quantityInput.value);
                            } else {
                                console.log("Fallback row click (unchecked item): Programmatically clicking checkbox.");
                                checkbox.click();
                            }
                        }
                    } else {
                        console.log("Fallback row click on excluded element.");
                    }
                });
            }
        });
    }

    // --- Live Search Input Event Listener ---
    if (searchQueryInput) {
        searchQueryInput.addEventListener('input', function () {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
                filterTable();
            }, 300);
        });
    }

    // --- Event Listener for "Show selected" Toggle Switch ---
    if (showSelectedToggle) {
        showSelectedToggle.addEventListener('change', function() {
            filterTable();
        });
    }

    // --- Total Price Calculation and Dynamic Update (for individual rows) ---
    if (dataTableBody) {
        dataTableBody.addEventListener('input', function(event) {
            if (event.target.matches('.quantity-input')) {
                const qtyInput = event.target;
                const row = qtyInput.closest('tr');
                const totalPriceCell = row.querySelector('.total-price-cell');
                const checkbox = row.querySelector('input[type="checkbox"][name="selectedItems"]');

                if (!totalPriceCell) {
                    console.warn("Total Price Calc: '.total-price-cell' not found in row.", row);
                    return;
                }

                const quantity = parseFloat(qtyInput.value);
                const unitPriceRaw = row.dataset.unitPrice;
                if (!unitPriceRaw) {
                    console.warn("Total Price Calc: 'data-unit-price' not found on row.", row);
                    totalPriceCell.textContent = 'N/A';
                    return;
                }
                const unitPrice = parseFloat(unitPriceRaw.replace(/[^\d.]/g, ''));

                if (checkbox && !checkbox.checked && !isNaN(quantity) && quantity > 0) {
                    console.log("Qty changed to valid number > 0. Programmatically checking checkbox.");
                    checkbox.checked = true;
                    persistedCheckedItems.add(checkbox.value);
                    if (row) {
                        row.classList.add('table-checked');
                    }
                    saveCheckedItemsDebounced();
                    updateSelectionCount();
                    if (showSelectedToggle && showSelectedToggle.checked) {
                        filterTable();
                    }
                } else if (checkbox && checkbox.checked && (isNaN(quantity) || quantity <= 0)) {
                    console.log("Qty changed to invalid/zero. Programmatically unchecking checkbox.");
                    checkbox.checked = false;
                    persistedCheckedItems.delete(checkbox.value);
                    if (row) {
                        row.classList.remove('table-checked');
                    }
                    saveCheckedItemsDebounced();
                    updateSelectionCount();
                    if (showSelectedToggle && showSelectedToggle.checked) {
                        filterTable();
                    }
                }

                if (isNaN(quantity) || quantity <= 0) {
                    totalPriceCell.textContent = '';
                } else if (isNaN(unitPrice)) {
                    totalPriceCell.textContent = 'N/A';
                }
                else {
                    const totalPrice = (quantity * unitPrice).toFixed(2);
                    totalPriceCell.textContent = '$' + totalPrice;
                }
                updateGrandTotal();
            }
        });
    }

    // Initial calculation for existing quantities when the page loads
    document.querySelectorAll('.quantity-input').forEach(input => {
        // Trigger the input event for each quantity input to calculate its initial row total
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // --- Initial calls on page load ---
    filterTable(); // Apply initial filtering based on any search query and default toggle state
    updateSelectionCount(); // Ensure count is correct from persisted items
});