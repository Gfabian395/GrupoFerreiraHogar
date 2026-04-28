import styles from "../styles/CardCategory.module.css";

export default function CardCategory({
  category,
  onEdit,
  onSelect,
  onDelete,
}) {
  if (!category) return null;

  return (
    <article
      className={styles.card}
      onClick={() => onSelect?.(category)}
    >
      {/* ACCIONES */}
      {(onEdit || onDelete) && (
        <div className={styles.cardActions}>
          {onEdit && (
            <button
              className={styles.edit}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(category);
              }}
              title="Editar"
            >
              ✏️
            </button>
          )}

          {onDelete && (
            <button
              className={styles.delete}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Eliminar"
            >
              🗑
            </button>
          )}
        </div>
      )}

      <img
        src={category.imagenUrl}
        alt={category.nombre}
      />

      <div className={styles.content}>
        {category.tag && (
          <span className={styles.tag}>{category.tag}</span>
        )}
        <h3>{category.nombre}</h3>
        <p>{category.descripcion}</p>
      </div>
    </article>
  );
}
