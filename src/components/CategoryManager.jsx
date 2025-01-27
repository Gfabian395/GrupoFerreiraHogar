import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import './CategoryManager.css';

function CategoryManager() {
    const [categories, setCategories] = useState([]);
    const [currentCategory, setCurrentCategory] = useState({ id: '', name: '', imageUrl: '' });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState(''); // 'add', 'edit', 'delete'
    const navigate = useNavigate();

    useEffect(() => {
        const fetchCategories = async () => {
            const querySnapshot = await getDocs(collection(db, 'categories'));
            const categoriesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCategories(categoriesData);
        };

        fetchCategories();
    }, []);

    const handleAddCategory = async () => {
        if (currentCategory.name && currentCategory.imageUrl) {
            await addDoc(collection(db, 'categories'), { name: currentCategory.name, imageUrl: currentCategory.imageUrl });
            setCurrentCategory({ id: '', name: '', imageUrl: '' });
            closeModal();
            await fetchCategories();
        }
    };

    const handleEditCategory = async () => {
        const categoryDoc = doc(db, 'categories', currentCategory.id);
        await updateDoc(categoryDoc, { name: currentCategory.name, imageUrl: currentCategory.imageUrl });
        setCurrentCategory({ id: '', name: '', imageUrl: '' });
        closeModal();
        await fetchCategories();
    };

    const handleDeleteCategory = async (categoryId) => {
        const categoryDoc = doc(db, 'categories', categoryId);
        await deleteDoc(categoryDoc);
        closeModal();
        await fetchCategories();
    };

    const fetchCategories = async () => {
        const querySnapshot = await getDocs(collection(db, 'categories'));
        const categoriesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCategories(categoriesData);
    };

    const openModal = (type, category = { id: '', name: '', imageUrl: '' }) => {
        setModalType(type);
        setCurrentCategory(category);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setCurrentCategory({ id: '', name: '', imageUrl: '' });
    };

    const viewProducts = (categoryId) => {
        navigate(`/category/${categoryId}`);
    };

    return (
        <div>
            <button className="floating-button" onClick={() => setIsModalOpen(true)}>+</button>
            {isModalOpen && (
                <div className="modal">
                    <div className="modal-content">
                        <span className="close" onClick={closeModal}>&times;</span>
                        <h2>Seleccione una opción</h2>
                        <button onClick={() => openModal('add')}>Agregar</button>
                        <button onClick={() => openModal('edit')}>Editar</button>
                        <button onClick={() => openModal('delete')}>Eliminar</button>
                    </div>
                </div>
            )}
            {isModalOpen && modalType === 'add' && (
                <div className="modal">
                    <div className="modal-content">
                        <span className="close" onClick={closeModal}>&times;</span>
                        <h2>Nueva Categoría</h2>
                        <input
                            type="text"
                            value={currentCategory.name}
                            onChange={(e) => setCurrentCategory({ ...currentCategory, name: e.target.value })}
                            placeholder="Nombre de la categoría"
                        />
                        <input
                            type="text"
                            value={currentCategory.imageUrl}
                            onChange={(e) => setCurrentCategory({ ...currentCategory, imageUrl: e.target.value })}
                            placeholder="URL de la imagen"
                        />
                        <button onClick={handleAddCategory}>Agregar Categoría</button>
                    </div>
                </div>
            )}
            {isModalOpen && modalType === 'edit' && (
                <div className="modal">
                    <div className="modal-content">
                        <span className="close" onClick={closeModal}>&times;</span>
                        <h2>Editar Categoría</h2>
                        <div className="category-list">
                            {categories.map(category => (
                                <div key={category.id} className="category-item">
                                    <span>{category.name}</span>
                                    {category.imageUrl && <img src={category.imageUrl} alt={category.name} style={{ width: '50px', height: '50px' }} />}
                                    <button onClick={() => openModal('edit', category)}>Seleccionar</button>
                                </div>
                            ))}
                        </div>
                        {currentCategory.id && (
                            <div>
                                <input
                                    type="text"
                                    value={currentCategory.name}
                                    onChange={(e) => setCurrentCategory({ ...currentCategory, name: e.target.value })}
                                    placeholder="Nombre de la categoría"
                                />
                                <input
                                    type="text"
                                    value={currentCategory.imageUrl}
                                    onChange={(e) => setCurrentCategory({ ...currentCategory, imageUrl: e.target.value })}
                                    placeholder="URL de la imagen"
                                />
                                <button onClick={handleEditCategory}>Guardar Cambios</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {isModalOpen && modalType === 'delete' && (
                <div className="modal">
                    <div className="modal-content">
                        <span className="close" onClick={closeModal}>&times;</span>
                        <h2>Eliminar Categorías</h2>
                        <div className="category-list">
                            {categories.map(category => (
                                <div key={category.id} className="category-item">
                                    <span>{category.name}</span>
                                    {category.imageUrl && <img src={category.imageUrl} alt={category.name} style={{ width: '250px' }} />}
                                    <button onClick={() => handleDeleteCategory(category.id)}>Eliminar</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            <div className="category-list">
                {categories.map(category => (
                    <div key={category.id} className="category-item">
                        <span>{category.name}</span>
                        {category.imageUrl && <img src={category.imageUrl} alt={category.name} style={{ width: '250px' }} onClick={() => viewProducts(category.id)} />}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default CategoryManager;
