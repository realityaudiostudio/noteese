# Noteese 📝
**by Btechified**

**The Open Source Digital Notebook for Engineering Students.**

[![Open Source](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)
[![Powered by Btechified](https://img.shields.io/badge/Powered_by-Btechified-blue)](https://btechified.in)

**Noteese** is a powerful, web-based digital whiteboard and notebook application designed to help students take better notes, annotate PDFs, and organize their study materials in the cloud. Built with modern web technologies, it offers a seamless writing experience similar to premium tablet apps, but accessible right from your browser.

---

## 🚀 About Btechified

This project is proudly built and maintained by **[Btechified](https://btechified.vercel.app)**.

> **Btechified** is an innovative e-education platform dedicated to skill enhancement and engineering sessions. We provide a unique, **gamified approach** to learning, helping students master both syllabus-based and out-of-syllabus engineering concepts in an engaging way.

---

## ✨ Key Features

* **📄 PDF Import & Annotation:** Import lecture slides or textbooks and write directly on them using the PDF.js engine.
* **✏️ Advanced Drawing Tools:** Smooth, pressure-sensitive inking with Pen, Highlighter, and Eraser tools (powered by `perfect-freehand`).
* **☁️ Cloud Sync:** All notebooks are safely stored using **Supabase** (Database) and **Cloudflare R2** (Storage), accessible from any device.
* **📦 Freemium Model:** Built-in logic for "Free" vs "Premium" users (limit 3 notebooks for free users), complete with UI indicators.
* **📱 Responsive UI:** A clean, distraction-free interface with "Focus Mode" for uninterrupted studying.
* **📤 Export to PDF:** Convert your digital notes back into standard PDF format for sharing.

## 🛠️ Tech Stack

* **Frontend:** React.js, Vite
* **Styling:** Tailwind CSS, Ant Design
* **Backend/Auth:** Supabase (PostgreSQL + Auth)
* **Storage:** Cloudflare R2 (AWS SDK v3)
* **PDF Processing:** PDF.js (Legacy Build)
* **Inking:** Perfect-Freehand

## ⚙️ Installation & Setup

Want to run this locally? Follow these steps:

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/yourusername/noteese.git](https://github.com/yourusername/noteese.git)
    cd noteese
    ```

2.  **Install Dependencies**
    ```bash
    pnpm install
    ```

3.  **Configure Environment Variables**
    Create a `.env.local` file in the root directory and add your keys:
    ```env
    # Supabase Configuration
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

    # Cloudflare R2 (Backend Keys - NO VITE_ PREFIX)
    R2_ACCOUNT_ID=your_r2_account_id
    R2_ACCESS_KEY_ID=your_r2_access_key
    R2_SECRET_KEY=your_r2_secret_key

    # R2 Public Domain (Frontend)
    VITE_R2_PUBLIC_DOMAIN=[https://your-public-r2-domain.com](https://your-public-r2-domain.com)
    ```

4.  **Run Development Server**
    Since this project uses Serverless Functions for secure uploads, use the Vercel CLI:
    ```bash
    vercel dev
    ```
    *Open [http://localhost:3000](http://localhost:3000) to view it in the browser.*

## 🤝 Contributing

We welcome contributions! Whether it's fixing bugs, improving the UI, or suggesting new features for the Btechified ecosystem.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <p>Built with ❤️ by the <b>Btechified Team</b></p>
</div>
