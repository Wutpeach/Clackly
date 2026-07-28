import React, { forwardRef } from "react";

const SearchBox = forwardRef(function SearchBox({ value, onChange, onKeyDown }, ref) {
  return (
    <input
      ref={ref}
      className="search-box"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder="Search commands"
      spellCheck="false"
      autoComplete="off"
    />
  );
});

export default SearchBox;
