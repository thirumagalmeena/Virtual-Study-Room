import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import "../styles/CreateRoom.css";

function CreateRoom() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isPrivate: false,
    pin: "",
    capacity: 10,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const res = await API.post("/rooms/create", formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess(`Room created! ID: ${res.data.roomId}`);
      setTimeout(() => navigate(`/room/${res.data.roomId}`), 1000);
    } catch (err) {
      setError(err.response?.data?.msg || "Failed to create room");
    }
  };

  return (
    <div className="form-container">
      <h2>Create Room</h2>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <label>
          Room Name
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
          />
        </label>
        <label>
          Private Room
          <input
            type="checkbox"
            name="isPrivate"
            checked={formData.isPrivate}
            onChange={handleChange}
          />
        </label>
        {formData.isPrivate && (
          <label>
            PIN (min 4 chars)
            <input
              type="password"
              name="pin"
              value={formData.pin}
              onChange={handleChange}
              required={formData.isPrivate}
            />
          </label>
        )}
        <label>
          Capacity (1-40)
          <input
            type="number"
            name="capacity"
            min="1"
            max="40"
            value={formData.capacity}
            onChange={handleChange}
          />
        </label>
        <button type="submit">Create Room</button>
      </form>
    </div>
  );
}

export default CreateRoom;