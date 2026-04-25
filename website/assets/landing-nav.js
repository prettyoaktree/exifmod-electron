/**
 * Marks the marketing page top nav for the in-page section in view (#how-it-works vs #install).
 * Relies on the same nav structure as website/docs (How it works / User guide / Download).
 */
;(function () {
  const nav = document.querySelector('body > nav')
  if (!nav) return

  const aHow = nav.querySelector('a[href="#how-it-works"]')
  const aDown = nav.querySelector('a[href="#install"].btn-nav')
  if (!aHow || !aDown) return

  const hHow = document.getElementById('how-it-works')
  const hIn = document.getElementById('install')
  if (!hHow || !hIn) return

  const inPage = [aHow, aDown]

  function clearInPage() {
    for (const a of inPage) {
      a.classList.remove('is-active')
      a.removeAttribute('aria-current')
    }
  }

  /** @param {'top' | 'how' | 'install'} key */
  function setInPage(key) {
    clearInPage()
    if (key === 'how') {
      aHow.classList.add('is-active')
      aHow.setAttribute('aria-current', 'true')
    } else if (key === 'install') {
      aDown.classList.add('is-active')
      aDown.setAttribute('aria-current', 'true')
    }
  }

  function activationY() {
    return 88
  }

  function topOf(el) {
    return el.getBoundingClientRect().top + window.scrollY
  }

  function update() {
    const y = window.scrollY + activationY()
    const tHow = topOf(hHow)
    const tIn = topOf(hIn)
    if (y >= tIn - 12) setInPage('install')
    else if (y >= tHow - 12) setInPage('how')
    else setInPage('top')
  }

  let ticking = false
  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(function () {
      ticking = false
      update()
    })
  }

  function onHash() {
    const h = (location.hash || '').toLowerCase()
    if (h === '#install' || h === '#how-it-works') {
      requestAnimationFrame(function () {
        update()
      })
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  window.addEventListener('hashchange', onHash)
  window.addEventListener('load', function () {
    update()
  })
  update()
})()
