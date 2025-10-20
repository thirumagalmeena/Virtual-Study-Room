import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { initSocket, getSocket } from "../services/socket";

export default function ChatRoom() {
  const { roomId } = useParams();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [members, setMembers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null); // file uploads
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const s = initSocket();

    if (!s.connected) s.connect();

    s.emit("join_room", { roomCode: roomId });

    s.on("receive_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    s.on("room_members", (list) => {
      setMembers(list);
    });

    s.on("room_full", ({ message }) => {
      alert(message);
    });

    return () => {
      s.emit("leave_room", { roomCode: roomId });
      s.off("receive_message");
      s.off("room_members");
      s.off("room_full");
      s.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const sk = getSocket();

    // If file selected, upload first
    if (selectedFile) {
      const formData = new FormData();
      formData.append("file", selectedFile);

      try {
        const res = await fetch("http://localhost:5000/api/files/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (res.ok && data.path) {
          sk.emit("send_message", {
            roomCode: roomId,
            text: data.path,
            fileName: data.originalname,
            fileType: selectedFile.type,
          });
        } else {
          alert(data.message || "File upload failed");
        }

        setSelectedFile(null);
      } catch (err) {
        console.error("File upload failed:", err);
        alert("File upload failed. Check size/type.");
      }
      return; // Skip sending text if file
    }

    // Send text message
    if (!text.trim()) return;

    sk.emit("send_message", { roomCode: roomId, text });
    setText("");
  };

  const renderMessage = (m) => {
    if (m.fileType) {
      if (m.fileType.startsWith("image/")) {
        return (
          <img
            src={`http://localhost:5000/${m.text}`}
            alt={m.fileName}
            style={{ maxWidth: "200px" }}
          />
        );
      } else {
        return (
          <div>
            <a
              href={`http://localhost:5000/${m.text}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {m.fileName}
            </a>
            <a
              href={`http://localhost:5000/${m.text}`}
              download
              style={{ marginLeft: "10px" }}
            >
              [Download]
            </a>
          </div>
        );
      }
    }
    return m.text;
  };

  return (
    <div style={{ padding: "20px" }}>
      {/* Members List */}
      <div
        style={{
          borderBottom: "1px solid #ccc",
          paddingBottom: "10px",
          marginBottom: "10px",
        }}
      >
        <h4>Members ({members.filter((m) => m.online).length} online):</h4>
        <ul>
          {members
            .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0))
            .map((m) => (
              <li key={m.userId} style={{ color: m.online ? "green" : "gray" }}>
                {m.username}
              </li>
            ))}
        </ul>
      </div>

      <h2>Room: {roomId}</h2>

      {/* Chat Messages */}
      <div
        style={{
          height: "400px",
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: "10px",
          marginBottom: "10px",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: "8px",
              fontStyle: m.author === "System" ? "italic" : "normal",
              color: m.author === "System" ? "gray" : "black",
            }}
          >
            {m.author !== "System" && <b>{m.author}</b>}{" "}
            {m.author !== "System" && <small>[{m.time}]</small>}
            <div>{renderMessage(m)}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input + Send */}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        style={{ width: "60%", marginRight: "10px", padding: "8px" }}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
      />
      <button onClick={sendMessage}>Send</button>

      {/* File Upload */}
      <div style={{ marginTop: "10px" }}>
        <input
          type="file"
          onChange={(e) => setSelectedFile(e.target.files[0])}
        />
        {selectedFile && <span style={{ marginLeft: "10px" }}>{selectedFile.name}</span>}
      </div>
    </div>
  );
}
