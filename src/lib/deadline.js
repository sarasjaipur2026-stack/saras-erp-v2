export async function withDeadline(operation, ms = 15000) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Request timed out — check your connection')), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
