const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================================
// CONNEXION À POSTGRESQL
// ======================================================

if (!process.env.DATABASE_URL) {
  console.error("ERREUR : DATABASE_URL n'est pas définie.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

// ======================================================
// INITIALISATION DE LA BASE
// ======================================================

async function initialiserBase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preinscriptions (
      id SERIAL PRIMARY KEY,
      date_creation TIMESTAMPTZ DEFAULT NOW(),
      type_parcours VARCHAR(50) NOT NULL,
      nom_parent VARCHAR(150),
      prenom_parent VARCHAR(150),
      telephone VARCHAR(50) NOT NULL,
      email VARCHAR(200),
      nom_eleve VARCHAR(150) NOT NULL,
      prenom_eleve VARCHAR(150) NOT NULL,
      classe_actuelle VARCHAR(100),
      examen VARCHAR(100) NOT NULL,
      message TEXT,
      engagement BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  console.log("Table preinscriptions prête.");
}

initialiserBase().catch((error) => {
  console.error("Erreur initialisation PostgreSQL :", error);
});

// ======================================================
// TEST DU SERVEUR
// ======================================================

app.get("/", (req, res) => {
  res.json({
    service: "AVODA Académie - Pré-inscriptions",
    status: "OK"
  });
});

// ======================================================
// ENREGISTREMENT D'UNE PRÉ-INSCRIPTION
// ======================================================

app.post("/api/preinscriptions", async (req, res) => {
  try {
    const {
      type_parcours,
      nom_parent,
      prenom_parent,
      telephone,
      email,
      nom_eleve,
      prenom_eleve,
      classe_actuelle,
      examen,
      message,
      engagement
    } = req.body;

    if (
      !telephone ||
      !nom_eleve ||
      !prenom_eleve ||
      !examen ||
      engagement !== true
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Veuillez compléter les informations obligatoires et confirmer votre engagement."
      });
    }

    const resultat = await pool.query(
      `
      INSERT INTO preinscriptions
      (
        type_parcours,
        nom_parent,
        prenom_parent,
        telephone,
        email,
        nom_eleve,
        prenom_eleve,
        classe_actuelle,
        examen,
        message,
        engagement
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, date_creation;
      `,
      [
        type_parcours || "Candidature libre",
        nom_parent || null,
        prenom_parent || null,
        telephone,
        email || null,
        nom_eleve,
        prenom_eleve,
        classe_actuelle || null,
        examen,
        message || null,
        true
      ]
    );

    res.status(201).json({
      success: true,
      message:
        "Votre demande de pré-inscription a bien été enregistrée par AVODA Académie.",
      dossier: resultat.rows[0]
    });
  } catch (error) {
    console.error("Erreur pré-inscription :", error);

    res.status(500).json({
      success: false,
      message:
        "Une erreur est survenue pendant l'enregistrement de la pré-inscription."
    });
  }
});

// ======================================================
// PROTECTION DE L'ESPACE ADMINISTRATEUR
// ======================================================

function adminAuth(req, res, next) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return res.status(503).send(
      "L'espace administrateur AVODA n'est pas encore configuré."
    );
  }

  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Basic ")) {
    res.set(
      "WWW-Authenticate",
      'Basic realm="AVODA Administration"'
    );

    return res.status(401).send(
      "Authentification administrateur requise."
    );
  }

  try {
    const encoded = authorization.slice(6);

    const decoded = Buffer
      .from(encoded, "base64")
      .toString("utf8");

    const separator = decoded.indexOf(":");

    const username =
      separator >= 0
        ? decoded.slice(0, separator)
        : "";

    const password =
      separator >= 0
        ? decoded.slice(separator + 1)
        : "";

    if (
      username !== expectedUser ||
      password !== expectedPassword
    ) {
      res.set(
        "WWW-Authenticate",
        'Basic realm="AVODA Administration"'
      );

      return res.status(401).send(
        "Identifiant ou mot de passe incorrect."
      );
    }

    next();
  } catch (error) {
    return res.status(401).send(
      "Authentification invalide."
    );
  }
}

// ======================================================
// LECTURE DES PRÉ-INSCRIPTIONS
// ======================================================

app.get(
  "/api/admin/preinscriptions",
  adminAuth,
  async (req, res) => {
    try {
      const resultat = await pool.query(`
        SELECT
          id,
          date_creation,
          type_parcours,
          nom_parent,
          prenom_parent,
          telephone,
          email,
          nom_eleve,
          prenom_eleve,
          classe_actuelle,
          examen,
          message,
          engagement
        FROM preinscriptions
        ORDER BY date_creation DESC, id DESC;
      `);

      res.json({
        success: true,
        total: resultat.rowCount,
        preinscriptions: resultat.rows
      });

    } catch (error) {
      console.error(
        "Erreur lecture pré-inscriptions :",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Impossible de charger les pré-inscriptions."
      });
    }
  }
);

// ======================================================
// EXPORT CSV / EXCEL
// ======================================================

app.get(
  "/api/admin/preinscriptions.csv",
  adminAuth,
  async (req, res) => {
    try {
      const resultat = await pool.query(`
        SELECT
          id,
          date_creation,
          type_parcours,
          nom_parent,
          prenom_parent,
          telephone,
          email,
          nom_eleve,
          prenom_eleve,
          classe_actuelle,
          examen,
          message,
          engagement
        FROM preinscriptions
        ORDER BY date_creation DESC, id DESC;
      `);

      const colonnes = [
        "ID",
        "Date",
        "Parcours",
        "Nom parent",
        "Prénom parent",
        "Téléphone",
        "E-mail",
        "Nom élève",
        "Prénom élève",
        "Classe actuelle",
        "Examen",
        "Message",
        "Engagement"
      ];

      function csvValue(value) {
        const texte =
          value === null || value === undefined
            ? ""
            : String(value);

        return `"${texte.replace(/"/g, '""')}"`;
      }

      const lignes = resultat.rows.map((r) => [
        r.id,
        r.date_creation,
        r.type_parcours,
        r.nom_parent,
        r.prenom_parent,
        r.telephone,
        r.email,
        r.nom_eleve,
        r.prenom_eleve,
        r.classe_actuelle,
        r.examen,
        r.message,
        r.engagement ? "Oui" : "Non"
      ]);

      const csv =
        "\uFEFF" +
        colonnes.map(csvValue).join(";") +
        "\n" +
        lignes
          .map((ligne) =>
            ligne.map(csvValue).join(";")
          )
          .join("\n");

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="preinscriptions-avoda.csv"'
      );

      res.send(csv);

    } catch (error) {
      console.error(
        "Erreur export CSV :",
        error
      );

      res.status(500).send(
        "Impossible de générer l'export."
      );
    }
  }
);

// ======================================================
// PAGE ADMINISTRATEUR
// ======================================================

app.get("/admin", adminAuth, (req, res) => {
  res.sendFile(
    path.join(__dirname, "admin.html")
  );
});

// ======================================================
// DÉMARRAGE DU SERVEUR
// ======================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Serveur AVODA démarré sur le port ${PORT}`
  );
});
