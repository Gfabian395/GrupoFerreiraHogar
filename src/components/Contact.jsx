import React from 'react';
import ContactCard from './ContactCard'; // Importar ContactCard
import './Contact.css';

const sellers = [
    {
        name: 'Vanesa',
        phone: '+54 9 11 1234-5678',
        whatsapp: 'https://wa.me/5491138002078',
        logo: 'logo1.png',
        image: 'https://karlacsphotography.com/wp-content/uploads/2020/03/MG_6970_2.jpg',
        description: 'Vendedor de electrodomésticos.',
        color: '#ff0000'
    },
    {
        name: 'Fabian',
        phone: '+54 9 11 8765-4321',
        whatsapp: 'https://wa.me/5491159781434',
        logo: 'logo2.png',
        image: 'image2.png',
        description: 'Especialista en tecnología.',
        color: '#03a9f4'
    },
    // Añade más vendedores según sea necesario
];

function Contact() {
    return (
        <div className="contact-container">
            <div className="contact-list">
                {sellers.map((seller, index) => (
                    <ContactCard key={index} seller={seller} />
                ))}
            </div>
        </div>
    );
}

export default Contact;
