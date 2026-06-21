import { useEffect, useState } from 'react'
import styles from './Knocking.module.css'

export default function Knocking({ dispatch }) {
  const [phase, setPhase] = useState('approach')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('knocking'), 600)
    const t2 = setTimeout(() => setPhase('opening'), 3000)
    const t3 = setTimeout(() => dispatch({ type: 'DOOR_OPENED' }), 4400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [dispatch])

  return (
    <div className={styles.scene}>
      {/* Ambient hallway lights */}
      <div className={styles.ambient} />

      <div className={styles.corridor}>
        {/* Floor perspective lines */}
        <div className={styles.floorLeft} />
        <div className={styles.floorRight} />

        <div className={styles.doorframeOuter}>
          <div className={styles.doorframeInner}>
            <div className={`${styles.door} ${styles[phase]}`}>
              <div className={styles.doorSurface}>
                <div className={styles.panelTop} />
                <div className={styles.panelBottom} />
                <div className={styles.knob} />
              </div>
            </div>

            {/* Peek of room when door opens */}
            <div className={styles.roomBehind}>
              <div className={styles.roomGlow} />
            </div>
          </div>
        </div>
      </div>

      {/* Knock sfx label */}
      {phase === 'knocking' && (
        <div className={styles.knockLabel} key="knock">
          *knock knock*
        </div>
      )}

      <p className={styles.status}>
        {phase === 'approach' && 'Walking up to the door…'}
        {phase === 'knocking' && 'Knocking…'}
        {phase === 'opening' && 'The door opens.'}
      </p>
    </div>
  )
}
