const DB_URL = "https://jee-prep-464d2-default-rtdb.firebaseio.com/data.json";

// WRITE like editing a file
async function writeData() {
  await fetch(DB_URL, {
    method: "PUT",
    body: JSON.stringify({
      message: "Hello from GitHub Pages",
      updatedAt: new Date().toISOString()
    })
  });
  alert("Data written!");
}

// READ shared data
async function readData() {
  const res = await fetch(DB_URL);
  const data = await res.json();
  document.getElementById("output").textContent =
    JSON.stringify(data, null, 2);
}
