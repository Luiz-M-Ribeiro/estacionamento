// login.js - simula autenticação e guarda sessão em localStorage
const users = [
  { username: "operador", password: "123", role: "operador", name: "Operador 1" },
  { username: "admin", password: "admin", role: "admin", name: "Administrador" }
];

const form = document.getElementById("loginForm");
const btnDemo = document.getElementById("btnDemo");

btnDemo.addEventListener("click", () => {
  const demo = users[0];
  localStorage.setItem("est_session", JSON.stringify(demo));
  window.location.href = "/estacionamento/dashboart.html";
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const u = document.getElementById("user").value.trim();
  const p = document.getElementById("pass").value;
  const match = users.find(x => x.username === u && x.password === p);
  
  if (!match) {
    alert("Usuário ou senha incorretos.");
    return;
  }

  localStorage.setItem("est_session", JSON.stringify(match));
  window.location.href = "/estacionamento/dashboart.html";
});
