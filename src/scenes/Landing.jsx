import { useEffect, useRef } from 'react'
import styles from './Landing.module.css'

const PARTICLE_COUNT = 40

export default function Landing({ dispatch }) {
  const particleRootRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const container = particleRootRef.current
    if (!container) return

    const particles = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const el = document.createElement('div')
      el.className = styles.particle
      const angle = (360 / PARTICLE_COUNT) * i + (Math.random() - 0.5) * 18
      const dist = 70 + Math.random() * 110
      const size = 4 + Math.random() * 9
      const dur = 900 + Math.random() * 700
      const delay = Math.random() * 300
      const color = Math.random() > 0.55 ? '#FFFFFF' : '#FBE9D0'

      el.style.cssText = [
        `width:${size}px`,
        `height:${size}px`,
        `background:${color}`,
        `border-radius:50%`,
        `position:absolute`,
        `top:50%`,
        `left:50%`,
        `--dx:${(Math.cos((angle * Math.PI) / 180) * dist).toFixed(1)}px`,
        `--dy:${(Math.sin((angle * Math.PI) / 180) * dist).toFixed(1)}px`,
        `animation:${styles.burst} ${dur}ms ease-out ${delay}ms both`,
      ].join(';')
      container.appendChild(el)
      particles.push(el)
    }
    return () => particles.forEach(p => p.remove())
  }, [])

  return (
    <div className={styles.landing}>
      <div className={styles.hero}>

        {/* Exploding can + particles */}
        <div className={styles.canStage}>
          <div className={styles.particleRoot} ref={particleRootRef} />
          <div className={styles.can}>
            <div className={styles.canTop} />
            <div className={styles.canBody}>
              <div className={styles.canRibbon}>
                <span className={styles.canLabelText}>Fizz<br />Buzz</span>
              </div>
              <div className={styles.canShine} />
            </div>
            <div className={styles.canBottom} />
          </div>
          <div className={styles.fizzGlow} />
        </div>

        {/* Ribbon + wordmark */}
        <div className={styles.ribbonWrap}>
          <svg
            className={styles.ribbonSvg}
            viewBox="0 0 900 110"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0,55 C150,5 300,105 450,55 C600,5 750,105 900,55 L900,110 L0,110 Z"
              fill="white"
            />
          </svg>
          <h1 className={styles.wordmark}>Fizz Buzz</h1>
        </div>

        <p className={styles.tagline}>Rehearse the conversation you've been avoiding.</p>
        <p className={styles.subtext}>
          Based on a true story: a roommate, a freezer, twelve Coca-Cola cans,
          and zero remorse.
        </p>

        <button
          className={styles.cta}
          onClick={() => dispatch({ type: 'GO_SETUP' })}
        >
          Start the confrontation
        </button>
      </div>

      <footer className={styles.footer}>
        <span>fizz&thinsp;=&thinsp;exploded soda&ensp;·&ensp;buzz&thinsp;=&thinsp;confrontation energy&ensp;·&ensp;FizzBuzz&thinsp;=&thinsp;classic baby coding problem</span>
      </footer>
    </div>
  )
}
