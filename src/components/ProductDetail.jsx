import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import './ProductDetail.css';

function ProductDetail({ addToCart }) {
    const { id, productId } = useParams();
    const [product, setProduct] = useState(null);

    useEffect(() => {
        const fetchProduct = async () => {
            const productDoc = await getDoc(doc(db, 'categories', id, 'products', productId));
            setProduct({ id: productDoc.id, ...productDoc.data() });
        };

        fetchProduct();
    }, [id, productId]);

    if (!product) {
        return <p>Cargando...</p>;
    }

    return (
        <div className='detailContainer'>
            <h2>{product.name}</h2>
            {product.imageUrl && <img src={product.imageUrl} alt={product.name} style={{ width: '250px' }} />}
            <p>Precio: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(product.price)}</p>
            <p>Descripción: {product.description}</p>
            <div className="stock-info">
                <h3>Stock disponible:</h3>
                <p>Los Andes 4320: {product.stock?.LosAndes4320}</p>
                <p>Los Andes 4034: {product.stock?.LosAndes4034}</p>
            </div>
            <button onClick={() => addToCart(product)}>Agregar al Carrito</button>
        </div>
    );
}

export default ProductDetail;
