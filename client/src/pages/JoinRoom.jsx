import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import "../styles/CreateRoom.css";

function JoinRoom() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const res = await API.post(
        "/rooms/join",
        { roomId, pin },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`Joined room: ${res.data.name}`);
      // Navigate to room page instead of chat page
      setTimeout(() => navigate(`/room/${res.data.roomId}`), 1000);
    } catch (err) {
      setError(err.response?.data?.msg || "Failed to join room");
    }
  };

  return (
    <div className="form-container">
      <h2>Join Room</h2>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <label>
          Room ID
          <input
            type="text"
            name="roomId"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            required
          />
        </label>
        <label>
          PIN (if private)
          <input
            type="password"
            name="pin"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        <button type="submit">Join Room</button>
      </form>
    </div>
  );
}

export default JoinRoom;