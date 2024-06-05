document.addEventListener('DOMContentLoaded', function () {
    const products = document.querySelectorAll(".product");
    const cartList = document.querySelector(".cart-list");
    const totalElement = document.querySelector(".total span");
    const clearButton = document.querySelector(".clear-cart");
    const cartIcon = document.querySelector('.cart-icon');
    const cartCount = document.querySelector('.cart-count');
    const cartElement = document.querySelector('.cart');

    let cart = [];

    // Recuperar el carrito del localStorage si existe
    if (localStorage.getItem('cart')) {
        cart = JSON.parse(localStorage.getItem('cart'));
        updateCartUI();
    }

    products.forEach(product => {
        const addToCartButton = product.querySelector(".add-to-cart");
        addToCartButton.addEventListener("click", () => addToCart(product));
    });

    clearButton.addEventListener("click", clearCart);
    cartIcon.addEventListener("click", () => {
        cartElement.classList.toggle('visible');
    });

    document.addEventListener('click', function(event) {
        // Si el clic ocurrió fuera del carrito y fuera del icono del carrito, oculta el carrito
        if (!cartElement.contains(event.target) && event.target !== cartIcon) {
            cartElement.classList.remove('visible');
        }
    });

    function addToCart(product) {
        const productId = product.dataset.id;
        const productName = product.dataset.name;
        const productPrice = parseInt(product.dataset.price);
        const existingProduct = cart.find(item => item.id === productId);
        if (existingProduct) {
            existingProduct.quantity += 1;
        } else {
            cart.push({ id: productId, name: productName, price: productPrice, quantity: 1 });
        }

        updateCartUI();
        saveCartToLocalStorage();
    }

    function updateCartUI() {
        cartList.innerHTML = "";
        let total = 0;
        let totalItems = 0;
        cart.forEach(item => {
            const listItem = document.createElement("li");
            listItem.innerHTML = `${item.name} x${item.quantity} - $${(item.price * item.quantity).toLocaleString()}`;

            const removeButton = document.createElement("button");
            removeButton.classList.add("remove-item");
            removeButton.dataset.id = item.id;

            const icon = document.createElement("i");
            icon.classList.add('bx', 'bxs-tag-x', 'red-icon');
            removeButton.appendChild(icon);

            removeButton.addEventListener("click", () => removeItem(item.id));

            listItem.appendChild(removeButton);
            cartList.appendChild(listItem);

            total += item.price * item.quantity;
            totalItems += item.quantity;
        });

        totalElement.textContent = total.toLocaleString();
        cartCount.textContent = totalItems;
    }

    function removeItem(productId) {
        cart = cart.filter(item => item.id !== productId);
        updateCartUI();
        saveCartToLocalStorage();
    }

    function clearCart() {
        cart = [];
        updateCartUI();
        saveCartToLocalStorage();
    }

    function saveCartToLocalStorage() {
        localStorage.setItem('cart', JSON.stringify(cart));
    }
});
