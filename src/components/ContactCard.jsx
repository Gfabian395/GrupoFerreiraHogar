import React from 'react';
import './ContactCard.css';

function ContactCard({ seller }) {
    return (
        <div className="card">
            <div className="bg"></div>
            <div className="blob"></div>
            <div className="content">
                <h2>{seller.name}</h2>
                <img src={seller.image} alt={seller.name} className="seller-image" />
                <p>{seller.description}</p>
                <a className="wp" href={seller.whatsapp} target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-whatsapp fa-2x"></i>
                </a>
            </div>
        </div>
    );
}

export default ContactCard;
