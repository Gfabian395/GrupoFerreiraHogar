import styles from "../styles/Loader.module.css";

export const Loader = () => {
  return (
    <div className={styles.overlay}>
      <div className={styles.loader}>
        <div className={styles.dot}></div>
        <div className={styles.dot}></div>
        <div className={styles.dot}></div>
      </div>
    </div>
  );
};
