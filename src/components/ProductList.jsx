import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import './ProductList.css';

function ProductList() {
    const { id } = useParams();
    const [products, setProducts] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: '',
        price: '',
        description: '',
        imageUrl: ''
    });

    useEffect(() => {
        const fetchProducts = async () => {
            const querySnapshot = await getDocs(collection(db, 'categories', id, 'products'));
            const productsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProducts(productsData);
        };

        fetchProducts();
    }, [id]);

    const handleAddProduct = async () => {
        if (newProduct.name && newProduct.price && newProduct.description) {
            await addDoc(collection(db, 'categories', id, 'products'), {
                ...newProduct
            });
            setNewProduct({ name: '', price: '', description: '', imageUrl: '' });
            setIsModalOpen(false);
            const fetchProducts = async () => {
                const querySnapshot = await getDocs(collection(db, 'categories', id, 'products'));
                const productsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setProducts(productsData);
            };
            fetchProducts();
        }
    };

    const openModal = () => {
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setNewProduct({ name: '', price: '', description: '', imageUrl: '' });
    };

    return (
        <div>
            <div className="product-list">
                {products.map(product => (
                    <Link to={`/category/${id}/product/${product.id}`} key={product.id} className="product-item">
                        <span className='title'>{product.name}</span>
                        {product.imageUrl && <img src={product.imageUrl} alt={product.name} style={{ width: '250px' }} />}
                    </Link>
                ))}
            </div>
            <button className="floating-button" onClick={openModal}>+</button>
            {isModalOpen && (
                <div className="modal">
                    <div className="modal-content">
                        <span className="close" onClick={closeModal}>&times;</span>
                        <h2>Añadir Producto</h2>
                        <input
                            type="text"
                            value={newProduct.name}
                            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                            placeholder="Nombre del producto"
                        />
                        <input
                            type="number"
                            value={newProduct.price}
                            onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                            placeholder="Precio"
                        />
                        <textarea
                            value={newProduct.description}
                            onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                            placeholder="Descripción"
                        />
                        <input
                            type="text"
                            value={newProduct.imageUrl}
                            onChange={(e) => setNewProduct({ ...newProduct, imageUrl: e.target.value })}
                            placeholder="URL de la imagen"
                        />
                        <button onClick={handleAddProduct}>Añadir Producto</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ProductList;
