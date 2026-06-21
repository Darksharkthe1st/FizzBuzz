import { useState, useRef } from 'react'
import styles from './Setup.module.css'

export default function Setup({ dispatch }) {
  const [situation, setSituation] = useState('')
  const [preview, setPreview] = useState(null)
  const fileInputRef = useRef(null)

  function handleImageChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!situation.trim()) return
    dispatch({
      type: 'START_KNOCKING',
      situation: situation.trim(),
      roommateImage: preview,
    })
  }

  return (
    <div className={styles.setup}>
      <header className={styles.header}>
        <span className={styles.logo}>Fizz Buzz</span>
        <span className={styles.logoSub}>Roommate Confrontation Simulator</span>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <h2 className={styles.heading}>Set the scene</h2>
          <p className={styles.hint}>
            Describe what your roommate did. We'll feed it straight to them so they know exactly what they're denying.
          </p>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div>
              <label className={styles.label} htmlFor="situation">
                What happened?
              </label>
              <textarea
                id="situation"
                className={styles.textarea}
                value={situation}
                onChange={e => setSituation(e.target.value)}
                placeholder="e.g. You put 12 Coca-Cola cans in the freezer. They exploded at 2am, coated the entire freezer in brown slush, and I had to clean it up alone while you slept."
                rows={5}
                required
              />
            </div>

            <div>
              <label className={styles.label}>
                Roommate's face <span className={styles.optional}>(optional — but funnier)</span>
              </label>
              <div
                className={styles.uploadZone}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                aria-label="Upload roommate photo"
              >
                {preview ? (
                  <img src={preview} alt="Roommate preview" className={styles.previewImg} />
                ) : (
                  <div className={styles.uploadPlaceholder}>
                    <span className={styles.uploadIcon} aria-hidden="true">📷</span>
                    <span className={styles.uploadText}>Drop their face here</span>
                    <span className={styles.uploadSub}>We'll make it worse</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={handleImageChange}
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>

            <button
              type="submit"
              className={styles.submit}
              disabled={!situation.trim()}
            >
              Knock on the door
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
